#!/usr/bin/env node
/**
 * CLISHOP MCP Server
 *
 * Exposes CLISHOP shopping tools over the Model Context Protocol (stdio transport).
 * Every Claude Desktop, Cursor, Windsurf, or other MCP client gets access to:
 *   - product search (local + extended across vendor stores)
 *   - order placement ("buy")
 *   - order management (list, show, cancel, reorder)
 *   - address CRUD
 *   - payment method management
 *   - store browsing
 *   - agent (safety profile) management
 *   - reviews, support tickets, advertise requests, feedback
 *   - account status
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { getApiClient, handleApiError } from "./api.js";
import { getActiveAgent, getConfig, getApiBaseUrl } from "./config.js";
import { isLoggedIn, getUserInfo } from "./auth.js";

// ── Helpers ──────────────────────────────────────────────────────────

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );
}

/** Wrap an async handler so API errors become MCP tool errors. */
function safeCall<T>(
  fn: () => Promise<T>,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  return fn()
    .then((data) => ({
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }))
    .catch((error) => {
      let message = "Unknown error";
      if (error && typeof error === "object") {
        if ("response" in error && error.response?.data) {
          const d = error.response.data;
          message = d.message || d.error || JSON.stringify(d);
        } else if ("message" in error) {
          message = error.message;
        }
      }
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    });
}

// ── Server setup ─────────────────────────────────────────────────────

const server = new McpServer(
  {
    name: "clishop",
    version: "1.2.2",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// =====================================================================
// TOOL: search_products
// =====================================================================
server.registerTool("search_products", {
  title: "Search Products",
  description:
    "Search for products across all connected stores. Supports filters for price, category, brand, delivery location, shipping speed, ratings, and more. Returns product listings with pricing, availability, and store info.",
  inputSchema: {
    query: z.string().describe("Search query (e.g. 'wireless earbuds', 'running shoes')"),
    category: z.string().optional().describe("Filter by product category"),
    brand: z.string().optional().describe("Filter by brand name"),
    store: z.string().optional().describe("Limit to a specific store (ID, slug, or name)"),
    minPrice: z.number().optional().describe("Minimum price in cents"),
    maxPrice: z.number().optional().describe("Maximum price in cents"),
    freeShipping: z.boolean().optional().describe("Only show items with free shipping"),
    country: z.string().optional().describe("Delivery country ISO code (e.g. US, NL, GB)"),
    maxDeliveryDays: z.number().optional().describe("Maximum delivery days"),
    inStock: z.boolean().optional().describe("Only show in-stock items"),
    freeReturns: z.boolean().optional().describe("Only show items with free returns"),
    trustedOnly: z.boolean().optional().describe("Only show products from verified stores"),
    minRating: z.number().optional().describe("Minimum product rating (1-5)"),
    sort: z
      .enum(["price", "rating", "relevance", "newest", "delivery"])
      .optional()
      .describe("Sort field"),
    order: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
    page: z.number().optional().describe("Page number (default 1)"),
    perPage: z.number().optional().describe("Results per page (default 10)"),
    extendedSearch: z
      .boolean()
      .optional()
      .describe("Enable extended search across all vendor darkstores in real-time"),
  },
  annotations: {
    title: "Search Products",
    readOnlyHint: true,
    openWorldHint: true,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();

    // Auto-resolve country from default address if not provided (same as CLI)
    let country = args.country;
    if (!country) {
      const agent = getActiveAgent();
      try {
        const addrRes = await api.get("/addresses", { params: { agent: agent.name } });
        const addresses = addrRes.data.addresses || [];
        const resolved = (agent.defaultAddressId && addresses.find((a: any) => a.id === agent.defaultAddressId))
          || addresses[0];
        if (resolved) {
          country = resolved.country;
          if (!agent.defaultAddressId) {
            const { updateAgent } = await import("./config.js");
            updateAgent(agent.name, { defaultAddressId: resolved.id });
          }
        }
      } catch {
        // Address lookup failed — continue without it
      }
    }
    if (!country) {
      throw new Error("No delivery country available. Add a shipping address first ('clishop address add') or pass the 'country' parameter (e.g. 'US', 'NL', 'BE').");
    }

    const res = await api.get("/products/search", {
      params: {
        q: args.query,
        category: args.category,
        brand: args.brand,
        store: args.store,
        minPrice: args.minPrice,
        maxPrice: args.maxPrice,
        freeShipping: args.freeShipping || undefined,
        country,
        maxDeliveryDays: args.maxDeliveryDays,
        inStock: args.inStock || undefined,
        freeReturns: args.freeReturns || undefined,
        trustedOnly: args.trustedOnly || undefined,
        minRating: args.minRating,
        sort: args.sort,
        order: args.order,
        page: args.page,
        pageSize: args.perPage,
        extendedSearch: args.extendedSearch || undefined,
        extendedTimeout: args.extendedSearch ? 30 : undefined,
      },
      timeout: args.extendedSearch ? 35_000 : 15_000,
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: get_product
// =====================================================================
server.registerTool("get_product", {
  title: "Get Product Details",
  description:
    "Get detailed information about a specific product by its ID, including price, availability, description, specs, and store info.",
  inputSchema: {
    productId: z.string().describe("The product ID"),
  },
  annotations: {
    title: "Get Product Details",
    readOnlyHint: true,
    openWorldHint: true,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    try {
      const res = await api.get(`/products/${args.productId}`);
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        const extRes = await api.get(`/products/extended/${args.productId}`);
        return extRes.data;
      }
      throw err;
    }
  });
});

// =====================================================================
// TOOL: buy_product
// =====================================================================
server.registerTool("buy_product", {
  title: "Buy Product",
  description:
    "Place an order for a product. Uses the active agent's default address and payment method unless overridden. Respects agent safety limits (max order amount, blocked categories).",
  inputSchema: {
    productId: z.string().describe("Product ID to purchase"),
    quantity: z.number().optional().describe("Quantity (default 1)"),
    addressId: z.string().optional().describe("Shipping address ID (uses agent default if omitted)"),
    paymentId: z.string().optional().describe("Payment method ID (uses agent default if omitted)"),
    agent: z.string().optional().describe("Agent name to use (uses active agent if omitted)"),
  },
  annotations: {
    title: "Buy Product",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
}, async (args) => {
  return safeCall(async () => {
    const agent = getActiveAgent();
    const addressId = args.addressId || agent.defaultAddressId;
    const paymentId = args.paymentId || agent.defaultPaymentMethodId;

    if (!addressId) {
      throw new Error("No shipping address set. Add one first via the address_add tool or 'clishop address add'.");
    }
    if (!paymentId) {
      throw new Error("No payment method set. Add one first via 'clishop payment add'.");
    }

    const api = getApiClient();

    // Fetch product to check safety limits
    let product: any;
    try {
      const res = await api.get(`/products/${args.productId}`);
      product = res.data.product;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        const extRes = await api.get(`/products/extended/${args.productId}`);
        product = extRes.data.product;
      } else {
        throw err;
      }
    }

    const qty = args.quantity || 1;
    const totalCents = product.priceInCents * qty;

    if (agent.maxOrderAmount && totalCents / 100 > agent.maxOrderAmount) {
      throw new Error(
        `Order total (${formatPrice(totalCents, product.currency)}) exceeds agent "${agent.name}" limit of $${agent.maxOrderAmount}.`,
      );
    }
    if (agent.blockedCategories?.includes(product.category)) {
      throw new Error(`Category "${product.category}" is blocked for agent "${agent.name}".`);
    }
    if (
      agent.allowedCategories?.length &&
      !agent.allowedCategories.includes(product.category)
    ) {
      throw new Error(
        `Category "${product.category}" is not in the allowed list for agent "${agent.name}".`,
      );
    }

    const res = await api.post("/orders", {
      agent: args.agent || agent.name,
      items: [{ productId: args.productId, quantity: qty }],
      shippingAddressId: addressId,
      paymentMethodId: paymentId,
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: list_orders
// =====================================================================
server.registerTool("list_orders", {
  title: "List Orders",
  description: "List the user's orders, optionally filtered by status.",
  inputSchema: {
    status: z
      .enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"])
      .optional()
      .describe("Filter orders by status"),
    page: z.number().optional().describe("Page number"),
  },
  annotations: {
    title: "List Orders",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get("/orders", {
      params: { status: args.status, page: args.page },
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: get_order
// =====================================================================
server.registerTool("get_order", {
  title: "Get Order Details",
  description: "Show full details of a specific order including items, status, tracking, and shipments.",
  inputSchema: {
    orderId: z.string().describe("Order ID"),
  },
  annotations: {
    title: "Get Order Details",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get(`/orders/${args.orderId}`);

    // Also try to fetch tracking
    let tracking = null;
    try {
      const trackRes = await api.get(`/orders/${args.orderId}/tracking`);
      tracking = trackRes.data.tracking || null;
    } catch {
      // Tracking not available
    }

    return { ...res.data, tracking };
  });
});

// =====================================================================
// TOOL: cancel_order
// =====================================================================
server.registerTool("cancel_order", {
  title: "Cancel Order",
  description: "Cancel a pending or confirmed order. Cannot cancel orders that are already shipped or delivered.",
  inputSchema: {
    orderId: z.string().describe("Order ID to cancel"),
  },
  annotations: {
    title: "Cancel Order",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.post(`/orders/${args.orderId}/cancel`);
    return res.data;
  });
});

// =====================================================================
// TOOL: list_addresses
// =====================================================================
server.registerTool("list_addresses", {
  title: "List Addresses",
  description: "List all saved shipping addresses for the active agent.",
  inputSchema: {
    agent: z.string().optional().describe("Agent name (defaults to active agent)"),
  },
  annotations: {
    title: "List Addresses",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const agent = getActiveAgent();
    const api = getApiClient();
    const res = await api.get("/addresses", {
      params: { agent: args.agent || agent.name },
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: add_address
// =====================================================================
server.registerTool("add_address", {
  title: "Add Address",
  description: "Add a new shipping address. Supports residential and business addresses with optional VAT/Tax ID.",
  inputSchema: {
    label: z.string().describe("Label for the address (e.g. 'Home', 'Office')"),
    firstName: z.string().describe("Recipient first name"),
    lastName: z.string().describe("Recipient last name"),
    line1: z.string().describe("Street name and number"),
    line2: z.string().optional().describe("Apartment, suite, floor, etc."),
    city: z.string().describe("City"),
    region: z.string().optional().describe("State / Province / Region"),
    postalCode: z.string().describe("Postal / ZIP code"),
    country: z.string().describe("Country (full name, e.g. Belgium, United States)"),
    phone: z.string().optional().describe("Phone number with country code (e.g. +32412345678)"),
    companyName: z.string().optional().describe("Company name (for business addresses)"),
    vatNumber: z.string().optional().describe("VAT number"),
    taxId: z.string().optional().describe("Tax ID / EIN"),
    instructions: z.string().optional().describe("Delivery instructions"),
    setDefault: z.boolean().optional().describe("Set as default address for the active agent"),
  },
  annotations: {
    title: "Add Address",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const agent = getActiveAgent();
    const api = getApiClient();
    const res = await api.post("/addresses", {
      agent: agent.name,
      label: args.label,
      firstName: args.firstName,
      lastName: args.lastName,
      line1: args.line1,
      line2: args.line2 || undefined,
      city: args.city,
      region: args.region || undefined,
      postalCode: args.postalCode,
      country: args.country,
      phone: args.phone || undefined,
      companyName: args.companyName || undefined,
      vatNumber: args.vatNumber || undefined,
      taxId: args.taxId || undefined,
      instructions: args.instructions || undefined,
    });

    // Auto-set as default if it's the only address, or if explicitly requested
    if (res.data.address?.id) {
      const shouldSetDefault = args.setDefault || !agent.defaultAddressId;
      if (shouldSetDefault) {
        const { updateAgent } = await import("./config.js");
        updateAgent(agent.name, { defaultAddressId: res.data.address.id });
      }
    }

    return res.data;
  });
});

// =====================================================================
// TOOL: remove_address
// =====================================================================
server.registerTool("remove_address", {
  title: "Remove Address",
  description: "Remove a saved shipping address by its ID.",
  inputSchema: {
    addressId: z.string().describe("Address ID to remove"),
  },
  annotations: {
    title: "Remove Address",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const agent = getActiveAgent();
    const api = getApiClient();
    await api.delete(`/addresses/${args.addressId}`);

    // Clear default if this was it
    const { updateAgent } = await import("./config.js");
    if (agent.defaultAddressId === args.addressId) {
      updateAgent(agent.name, { defaultAddressId: undefined });
    }

    // If only one address remains, auto-set it as default
    const remaining = await api.get("/addresses", { params: { agent: agent.name } });
    const addresses = remaining.data.addresses || [];
    if (addresses.length === 1) {
      updateAgent(agent.name, { defaultAddressId: addresses[0].id });
    }

    return { success: true, message: "Address removed." };
  });
});

// =====================================================================
// TOOL: list_payment_methods
// =====================================================================
server.registerTool("list_payment_methods", {
  title: "List Payment Methods",
  description: "List saved payment methods for the active agent.",
  inputSchema: {
    agent: z.string().optional().describe("Agent name (defaults to active agent)"),
  },
  annotations: {
    title: "List Payment Methods",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const agent = getActiveAgent();
    const api = getApiClient();
    const res = await api.get("/payment-methods", {
      params: { agent: args.agent || agent.name },
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: list_stores
// =====================================================================
server.registerTool("list_stores", {
  title: "List Stores",
  description:
    "Browse available stores. Filter by name, verification status, rating, or country.",
  inputSchema: {
    query: z.string().optional().describe("Search stores by name"),
    verified: z.boolean().optional().describe("Only show verified stores"),
    minRating: z.number().optional().describe("Minimum store rating (0-5)"),
    country: z.string().optional().describe("Filter by country"),
    sort: z.enum(["name", "rating", "newest", "products"]).optional().describe("Sort field"),
    page: z.number().optional().describe("Page number"),
    perPage: z.number().optional().describe("Results per page"),
  },
  annotations: {
    title: "List Stores",
    readOnlyHint: true,
    openWorldHint: true,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get("/stores", {
      params: {
        q: args.query,
        verified: args.verified || undefined,
        minRating: args.minRating,
        country: args.country,
        sort: args.sort,
        page: args.page,
        pageSize: args.perPage,
      },
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: get_store
// =====================================================================
server.registerTool("get_store", {
  title: "Get Store Details",
  description: "View detailed information about a store by name, slug, or ID.",
  inputSchema: {
    store: z.string().describe("Store ID, slug, or name"),
  },
  annotations: {
    title: "Get Store Details",
    readOnlyHint: true,
    openWorldHint: true,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get(`/stores/${encodeURIComponent(args.store)}`);
    return res.data;
  });
});

// =====================================================================
// TOOL: store_catalog
// =====================================================================
server.registerTool("store_catalog", {
  title: "Browse Store Catalog",
  description: "Browse a store's product catalog, optionally filtering by query, category, price, or rating.",
  inputSchema: {
    store: z.string().describe("Store ID, slug, or name"),
    query: z.string().optional().describe("Search within the store's products"),
    category: z.string().optional().describe("Filter by category"),
    minPrice: z.number().optional().describe("Minimum price in cents"),
    maxPrice: z.number().optional().describe("Maximum price in cents"),
    minRating: z.number().optional().describe("Minimum product rating"),
    sort: z.string().optional().describe("Sort field: price, rating, newest, name"),
    page: z.number().optional().describe("Page number"),
    perPage: z.number().optional().describe("Results per page"),
  },
  annotations: {
    title: "Browse Store Catalog",
    readOnlyHint: true,
    openWorldHint: true,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get(`/stores/${encodeURIComponent(args.store)}/products`, {
      params: {
        q: args.query,
        category: args.category,
        minPrice: args.minPrice,
        maxPrice: args.maxPrice,
        minRating: args.minRating,
        sort: args.sort,
        page: args.page,
        pageSize: args.perPage,
      },
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: account_status
// =====================================================================
server.registerTool("account_status", {
  title: "Account Status",
  description:
    "Show full account overview including user info, agents (safety profiles), addresses, and payment methods.",
  inputSchema: {},
  annotations: {
    title: "Account Status",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async () => {
  return safeCall(async () => {
    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      return { loggedIn: false, message: "Not logged in. Run 'clishop login' first." };
    }

    const api = getApiClient();
    const cfg = getConfig();
    const activeAgentName = cfg.get("activeAgent") || "default";

    const [userInfo, agentsRes] = await Promise.all([
      getUserInfo(),
      api.get("/agents"),
    ]);
    const agents = agentsRes.data.agents || [];

    const agentDetails = await Promise.all(
      agents.map(async (agent: any) => {
        const [addressesRes, paymentsRes] = await Promise.all([
          api.get("/addresses", { params: { agent: agent.name } }),
          api.get("/payment-methods", { params: { agent: agent.name } }),
        ]);
        return {
          ...agent,
          addresses: addressesRes.data.addresses || [],
          paymentMethods: paymentsRes.data.paymentMethods || [],
        };
      }),
    );

    return {
      loggedIn: true,
      user: userInfo,
      activeAgent: activeAgentName,
      agents: agentDetails,
    };
  });
});

// =====================================================================
// TOOL: list_agents
// =====================================================================
server.registerTool("list_agents", {
  title: "List Agents",
  description:
    "List all configured agents (safety profiles). Agents control spending limits, allowed categories, and default address/payment.",
  inputSchema: {},
  annotations: {
    title: "List Agents",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async () => {
  return safeCall(async () => {
    const { listAgents, getConfig } = await import("./config.js");
    const agents = listAgents();
    const active = getConfig().get("activeAgent");
    return { agents, activeAgent: active };
  });
});

// =====================================================================
// TOOL: create_advertise_request
// =====================================================================
server.registerTool("create_advertise_request", {
  title: "Advertise Request",
  description:
    "Can't find what you need? Create an advertised request and vendors will bid to fulfill it. Describe what you're looking for and optionally set a max price.",
  inputSchema: {
    title: z.string().describe("What you're looking for (product name / title)"),
    description: z.string().optional().describe("Detailed description of what you need"),
    brand: z.string().optional().describe("Preferred brand"),
    quantity: z.number().optional().describe("Quantity needed (default 1)"),
    maxBidPrice: z.number().optional().describe("Maximum bid price in cents you're willing to pay"),
    currency: z.string().optional().describe("Currency code (default USD)"),
  },
  annotations: {
    title: "Advertise Request",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
}, async (args) => {
  return safeCall(async () => {
    const agent = getActiveAgent();
    const api = getApiClient();
    const res = await api.post("/advertise", {
      agent: agent.name,
      title: args.title,
      description: args.description || undefined,
      brand: args.brand || undefined,
      quantity: args.quantity || 1,
      bidPriceInCents: args.maxBidPrice || undefined,
      currency: args.currency || "USD",
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: create_support_ticket
// =====================================================================
server.registerTool("create_support_ticket", {
  title: "Create Support Ticket",
  description:
    "Create a support ticket for an order. Use this when there's an issue with a delivery, wrong item, refund request, etc.",
  inputSchema: {
    orderId: z.string().describe("Order ID the ticket is about"),
    subject: z.string().describe("Short description of the issue"),
    message: z.string().describe("Detailed description of the issue"),
    category: z
      .enum(["general", "damaged", "missing", "wrong_item", "refund", "shipping", "other"])
      .optional()
      .describe("Issue category"),
    priority: z
      .enum(["low", "normal", "high", "urgent"])
      .optional()
      .describe("Ticket priority"),
  },
  annotations: {
    title: "Create Support Ticket",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.post("/support", {
      orderId: args.orderId,
      subject: args.subject,
      message: args.message,
      category: args.category || "general",
      priority: args.priority || "normal",
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: list_support_tickets
// =====================================================================
server.registerTool("list_support_tickets", {
  title: "List Support Tickets",
  description: "List your support tickets, optionally filtered by status.",
  inputSchema: {
    status: z.string().optional().describe("Filter by status (open, in_progress, resolved, closed)"),
  },
  annotations: {
    title: "List Support Tickets",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get("/support", {
      params: { status: args.status },
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: submit_feedback
// =====================================================================
server.registerTool("submit_feedback", {
  title: "Submit Feedback",
  description: "Report a bug or suggest an improvement to CLISHOP.",
  inputSchema: {
    type: z.enum(["bug", "suggestion"]).describe("Type of feedback"),
    title: z.string().describe("Short summary"),
    description: z.string().describe("Detailed description"),
    stepsToReproduce: z.string().optional().describe("Steps to reproduce (for bugs)"),
    actualBehavior: z.string().optional().describe("What actually happens (for bugs)"),
    expectedBehavior: z.string().optional().describe("What you expected (for bugs)"),
  },
  annotations: {
    title: "Submit Feedback",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.post("/feedback", {
      type: args.type,
      title: args.title,
      description: args.description,
      stepsToReproduce: args.stepsToReproduce || undefined,
      actualBehavior: args.actualBehavior || undefined,
      expectedBehavior: args.expectedBehavior || undefined,
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: add_product_review
// =====================================================================
server.registerTool("add_product_review", {
  title: "Add Product Review",
  description: "Write a review for a product. Rating is on a 1-10 scale.",
  inputSchema: {
    productId: z.string().describe("Product ID to review"),
    rating: z.number().min(1).max(10).describe("Rating from 1 (terrible) to 10 (perfect)"),
    title: z.string().describe("Review title"),
    body: z.string().describe("Review body text"),
    orderId: z.string().optional().describe("Associated order ID (optional)"),
  },
  annotations: {
    title: "Add Product Review",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.post(`/products/${args.productId}/reviews`, {
      rating: args.rating,
      title: args.title,
      body: args.body,
      orderId: args.orderId || undefined,
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: add_store_review
// =====================================================================
server.registerTool("add_store_review", {
  title: "Add Store Review",
  description: "Write a review for a store. Rating is on a 1-10 scale.",
  inputSchema: {
    storeId: z.string().describe("Store ID to review"),
    rating: z.number().min(1).max(10).describe("Rating from 1 (terrible) to 10 (perfect)"),
    title: z.string().describe("Review title"),
    body: z.string().describe("Review body text"),
    orderId: z.string().optional().describe("Associated order ID (optional)"),
  },
  annotations: {
    title: "Add Store Review",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.post(`/stores/${args.storeId}/reviews`, {
      rating: args.rating,
      title: args.title,
      body: args.body,
      orderId: args.orderId || undefined,
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: list_reviews
// =====================================================================
server.registerTool("list_reviews", {
  title: "List My Reviews",
  description: "List all product and store reviews you have written.",
  inputSchema: {},
  annotations: {
    title: "List My Reviews",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async () => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get("/reviews/mine");
    return res.data;
  });
});

// =====================================================================
// TOOL: get_product_rating
// =====================================================================
server.registerTool("get_product_rating", {
  title: "Get Product Rating",
  description: "View rating details for a product including review count, Bayesian average, and effective cap.",
  inputSchema: {
    productId: z.string().describe("Product ID"),
  },
  annotations: {
    title: "Get Product Rating",
    readOnlyHint: true,
    openWorldHint: true,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get(`/products/${args.productId}/rating`);
    return res.data;
  });
});

// =====================================================================
// TOOL: get_store_rating
// =====================================================================
server.registerTool("get_store_rating", {
  title: "Get Store Rating",
  description: "View rating details for a store including review count, Bayesian average, and effective cap.",
  inputSchema: {
    storeId: z.string().describe("Store ID"),
  },
  annotations: {
    title: "Get Store Rating",
    readOnlyHint: true,
    openWorldHint: true,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get(`/stores/${args.storeId}/rating`);
    return res.data;
  });
});

// =====================================================================
// TOOL: delete_review
// =====================================================================
server.registerTool("delete_review", {
  title: "Delete Review",
  description: "Delete one of your reviews (product or store).",
  inputSchema: {
    reviewId: z.string().describe("Review ID to delete"),
    isStoreReview: z.boolean().optional().describe("Set to true if this is a store review (default: product review)"),
  },
  annotations: {
    title: "Delete Review",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const endpoint = args.isStoreReview
      ? `/stores/reviews/${args.reviewId}`
      : `/products/reviews/${args.reviewId}`;
    await api.delete(endpoint);
    return { success: true, message: "Review deleted." };
  });
});

// =====================================================================
// TOOL: list_advertise_requests
// =====================================================================
server.registerTool("list_advertise_requests", {
  title: "List Advertise Requests",
  description: "List your advertised requests where vendors can bid to fulfill them.",
  inputSchema: {
    status: z.enum(["open", "closed", "accepted", "cancelled", "expired"]).optional().describe("Filter by status"),
    page: z.number().optional().describe("Page number"),
  },
  annotations: {
    title: "List Advertise Requests",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get("/advertise", {
      params: { status: args.status, page: args.page },
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: get_advertise_request
// =====================================================================
server.registerTool("get_advertise_request", {
  title: "Get Advertise Request",
  description: "View an advertised request and its vendor bids.",
  inputSchema: {
    advertiseId: z.string().describe("Advertise request ID"),
  },
  annotations: {
    title: "Get Advertise Request",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get(`/advertise/${args.advertiseId}`);
    return res.data;
  });
});

// =====================================================================
// TOOL: accept_advertise_bid
// =====================================================================
server.registerTool("accept_advertise_bid", {
  title: "Accept Advertise Bid",
  description: "Accept a vendor's bid on your advertised request. All other bids will be automatically rejected.",
  inputSchema: {
    advertiseId: z.string().describe("Advertise request ID"),
    bidId: z.string().describe("Bid ID to accept"),
  },
  annotations: {
    title: "Accept Advertise Bid",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.post(`/advertise/${args.advertiseId}/bids/${args.bidId}/accept`);
    return res.data;
  });
});

// =====================================================================
// TOOL: reject_advertise_bid
// =====================================================================
server.registerTool("reject_advertise_bid", {
  title: "Reject Advertise Bid",
  description: "Reject a vendor's bid on your advertised request.",
  inputSchema: {
    advertiseId: z.string().describe("Advertise request ID"),
    bidId: z.string().describe("Bid ID to reject"),
  },
  annotations: {
    title: "Reject Advertise Bid",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.post(`/advertise/${args.advertiseId}/bids/${args.bidId}/reject`);
    return res.data;
  });
});

// =====================================================================
// TOOL: cancel_advertise_request
// =====================================================================
server.registerTool("cancel_advertise_request", {
  title: "Cancel Advertise Request",
  description: "Cancel an open advertised request.",
  inputSchema: {
    advertiseId: z.string().describe("Advertise request ID to cancel"),
  },
  annotations: {
    title: "Cancel Advertise Request",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.post(`/advertise/${args.advertiseId}/cancel`);
    return res.data;
  });
});

// =====================================================================
// TOOL: get_support_ticket
// =====================================================================
server.registerTool("get_support_ticket", {
  title: "Get Support Ticket",
  description: "View a support ticket and its full message history.",
  inputSchema: {
    ticketId: z.string().describe("Support ticket ID"),
  },
  annotations: {
    title: "Get Support Ticket",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get(`/support/${args.ticketId}`);
    return res.data;
  });
});

// =====================================================================
// TOOL: reply_to_support_ticket
// =====================================================================
server.registerTool("reply_to_support_ticket", {
  title: "Reply to Support Ticket",
  description: "Send a reply message to an existing support ticket.",
  inputSchema: {
    ticketId: z.string().describe("Support ticket ID"),
    message: z.string().describe("Reply message text"),
  },
  annotations: {
    title: "Reply to Support Ticket",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.post(`/support/${args.ticketId}/reply`, {
      message: args.message,
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: close_support_ticket
// =====================================================================
server.registerTool("close_support_ticket", {
  title: "Close Support Ticket",
  description: "Close a resolved support ticket.",
  inputSchema: {
    ticketId: z.string().describe("Support ticket ID to close"),
  },
  annotations: {
    title: "Close Support Ticket",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.patch(`/support/${args.ticketId}/status`, { status: "closed" });
    return res.data;
  });
});

// =====================================================================
// TOOL: create_agent
// =====================================================================
server.registerTool("create_agent", {
  title: "Create Agent",
  description: "Create a new agent (safety profile) with spending limits and category restrictions.",
  inputSchema: {
    name: z.string().describe("Agent name (e.g. 'work', 'personal', 'gifts')"),
    maxOrderAmount: z.number().optional().describe("Max order amount in dollars (e.g. 100)"),
    requireConfirmation: z.boolean().optional().describe("Require confirmation before ordering (default: true)"),
    allowedCategories: z.array(z.string()).optional().describe("Only allow these categories"),
    blockedCategories: z.array(z.string()).optional().describe("Block these categories"),
  },
  annotations: {
    title: "Create Agent",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const { createAgent } = await import("./config.js");
    const agent = createAgent(args.name, {
      maxOrderAmount: args.maxOrderAmount,
      requireConfirmation: args.requireConfirmation ?? true,
      allowedCategories: args.allowedCategories,
      blockedCategories: args.blockedCategories,
    });
    return { success: true, agent };
  });
});

// =====================================================================
// TOOL: switch_agent
// =====================================================================
server.registerTool("switch_agent", {
  title: "Switch Active Agent",
  description: "Switch which agent (safety profile) is active. The active agent controls spending limits and defaults.",
  inputSchema: {
    name: z.string().describe("Agent name to switch to"),
  },
  annotations: {
    title: "Switch Active Agent",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const { setActiveAgent } = await import("./config.js");
    setActiveAgent(args.name);
    return { success: true, activeAgent: args.name };
  });
});

// =====================================================================
// TOOL: get_agent
// =====================================================================
server.registerTool("get_agent", {
  title: "Get Agent Details",
  description: "Show details of a specific agent (safety profile) including limits, categories, and defaults.",
  inputSchema: {
    name: z.string().optional().describe("Agent name (defaults to active agent)"),
  },
  annotations: {
    title: "Get Agent Details",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const { getAgent, getConfig } = await import("./config.js");
    const agentName = args.name || getConfig().get("activeAgent");
    const agent = getAgent(agentName);
    if (!agent) throw new Error(`Agent "${agentName}" not found.`);
    return { agent, isActive: agentName === getConfig().get("activeAgent") };
  });
});

// =====================================================================
// TOOL: update_agent
// =====================================================================
server.registerTool("update_agent", {
  title: "Update Agent",
  description: "Update an agent's settings (spending limits, category restrictions, confirmation preference).",
  inputSchema: {
    name: z.string().optional().describe("Agent name (defaults to active agent)"),
    maxOrderAmount: z.number().optional().describe("Max order amount in dollars"),
    requireConfirmation: z.boolean().optional().describe("Require confirmation before ordering"),
    allowedCategories: z.array(z.string()).optional().describe("Only allow these categories (empty = all)"),
    blockedCategories: z.array(z.string()).optional().describe("Block these categories (empty = none)"),
    defaultAddressId: z.string().optional().describe("Default shipping address ID"),
    defaultPaymentMethodId: z.string().optional().describe("Default payment method ID"),
  },
  annotations: {
    title: "Update Agent",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const { updateAgent, getAgent, getConfig } = await import("./config.js");
    const agentName = args.name || getConfig().get("activeAgent");
    const existing = getAgent(agentName);
    if (!existing) throw new Error(`Agent "${agentName}" not found.`);

    const updates: Record<string, any> = {};
    if (args.maxOrderAmount !== undefined) updates.maxOrderAmount = args.maxOrderAmount;
    if (args.requireConfirmation !== undefined) updates.requireConfirmation = args.requireConfirmation;
    if (args.allowedCategories !== undefined) updates.allowedCategories = args.allowedCategories;
    if (args.blockedCategories !== undefined) updates.blockedCategories = args.blockedCategories;
    if (args.defaultAddressId !== undefined) updates.defaultAddressId = args.defaultAddressId;
    if (args.defaultPaymentMethodId !== undefined) updates.defaultPaymentMethodId = args.defaultPaymentMethodId;

    const updated = updateAgent(agentName, updates);
    return { success: true, agent: updated };
  });
});

// =====================================================================
// TOOL: get_spending_limit
// =====================================================================
server.registerTool("get_spending_limit", {
  title: "Get Spending Limit",
  description: "View the current monthly spending limit.",
  inputSchema: {},
  annotations: {
    title: "Get Spending Limit",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async () => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get("/spending-limit");
    return res.data;
  });
});

// =====================================================================
// TOOL: set_spending_limit
// =====================================================================
server.registerTool("set_spending_limit", {
  title: "Set Spending Limit",
  description: "Change your monthly spending limit. May require email confirmation for security.",
  inputSchema: {
    amountInDollars: z.number().min(1).describe("New monthly spending limit in dollars (minimum $1)"),
  },
  annotations: {
    title: "Set Spending Limit",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const limitInCents = Math.round(args.amountInDollars * 100);
    const res = await api.patch("/spending-limit", { limitInCents });
    return res.data;
  });
});

// =====================================================================
// TOOL: remove_payment_method
// =====================================================================
server.registerTool("remove_payment_method", {
  title: "Remove Payment Method",
  description: "Remove a saved payment method by its ID.",
  inputSchema: {
    paymentMethodId: z.string().describe("Payment method ID to remove"),
  },
  annotations: {
    title: "Remove Payment Method",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    await api.delete(`/payment-methods/${args.paymentMethodId}`);

    // Clear default if this was the default
    const { getActiveAgent, updateAgent } = await import("./config.js");
    const agent = getActiveAgent();
    if (agent.defaultPaymentMethodId === args.paymentMethodId) {
      updateAgent(agent.name, { defaultPaymentMethodId: undefined });
    }

    return { success: true, message: "Payment method removed." };
  });
});

// =====================================================================
// TOOL: set_default_payment_method
// =====================================================================
server.registerTool("set_default_payment_method", {
  title: "Set Default Payment Method",
  description: "Set the default payment method for the active agent.",
  inputSchema: {
    paymentMethodId: z.string().describe("Payment method ID to set as default"),
  },
  annotations: {
    title: "Set Default Payment Method",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const { getActiveAgent, updateAgent } = await import("./config.js");
    const agent = getActiveAgent();
    updateAgent(agent.name, { defaultPaymentMethodId: args.paymentMethodId });
    return { success: true, message: `Default payment for agent "${agent.name}" set to ${args.paymentMethodId}.` };
  });
});

// =====================================================================
// TOOL: set_default_address
// =====================================================================
server.registerTool("set_default_address", {
  title: "Set Default Address",
  description: "Set the default shipping address for the active agent.",
  inputSchema: {
    addressId: z.string().describe("Address ID to set as default"),
  },
  annotations: {
    title: "Set Default Address",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const { getActiveAgent, updateAgent } = await import("./config.js");
    const agent = getActiveAgent();
    updateAgent(agent.name, { defaultAddressId: args.addressId });
    return { success: true, message: `Default address for agent "${agent.name}" set to ${args.addressId}.` };
  });
});

// =====================================================================
// TOOL: list_feedback
// =====================================================================
server.registerTool("list_feedback", {
  title: "List Feedback",
  description: "List your submitted bug reports and suggestions.",
  inputSchema: {
    type: z.enum(["bug", "suggestion"]).optional().describe("Filter by feedback type"),
    status: z.string().optional().describe("Filter by status (open, acknowledged, in_progress, fixed, wont_fix, closed)"),
  },
  annotations: {
    title: "List Feedback",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get("/feedback", {
      params: {
        ...(args.type ? { type: args.type } : {}),
        ...(args.status ? { status: args.status } : {}),
      },
    });
    return res.data;
  });
});

// =====================================================================
// TOOL: get_feedback
// =====================================================================
server.registerTool("get_feedback", {
  title: "Get Feedback Details",
  description: "View details of a specific bug report or suggestion by ID.",
  inputSchema: {
    feedbackId: z.string().describe("Feedback ID"),
  },
  annotations: {
    title: "Get Feedback Details",
    readOnlyHint: true,
    openWorldHint: false,
  },
}, async (args) => {
  return safeCall(async () => {
    const api = getApiClient();
    const res = await api.get(`/feedback/${args.feedbackId}`);
    return res.data;
  });
});

// ── Start the server ─────────────────────────────────────────────────

export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Direct entry point: node dist/mcp.js
const isDirectEntry =
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}` ||
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;

if (isDirectEntry) {
  startMcpServer().catch((err) => {
    process.stderr.write(`CLISHOP MCP server failed to start: ${err}\n`);
    process.exit(1);
  });
}
