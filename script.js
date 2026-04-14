/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectedProductsButton = document.getElementById(
  "clearSelectedProducts",
);
const generateRoutineButton = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const workerUrl = "https://still-union-bereaved.wjscata.workers.dev/"; // Replace with your Cloudflare Worker URL
const selectedProductsStorageKey = "lorealSelectedProductIds";
const maxContinuationRequests = 4;

let allProducts = [];
let selectedProducts = [];
let chatHistory = [];
let activeTooltipCard = null;

const productDescriptionTooltip = document.createElement("div");
productDescriptionTooltip.className = "product-description-tooltip";
productDescriptionTooltip.setAttribute("aria-hidden", "true");
document.body.appendChild(productDescriptionTooltip);

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

chatWindow.innerHTML = `
  <div class="placeholder-message">
    Ask a question about your routine to get started.
  </div>
`;

/* Load product data once so product selections stay in sync across filters */
async function loadProducts() {
  if (allProducts.length > 0) {
    return allProducts;
  }

  const response = await fetch("products.json");
  const data = await response.json();
  allProducts = data.products;
  return allProducts;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => `
    <div class="product-card" data-product-id="${product.id}" role="button" tabindex="0" aria-pressed="false">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
      </div>
    </div>
  `,
    )
    .join("");

  updateProductSelectionStyles();
}

function getSelectedProduct(productId) {
  return selectedProducts.find((product) => product.id === productId);
}

function getProductById(productId) {
  return allProducts.find((product) => product.id === productId);
}

function positionProductDescriptionTooltip(card) {
  const cardRect = card.getBoundingClientRect();
  const spacing = 10;
  const viewportPadding = 12;
  const tooltipWidth = productDescriptionTooltip.offsetWidth;
  const tooltipHeight = productDescriptionTooltip.offsetHeight;

  let left = cardRect.left + window.scrollX;
  const maxLeft =
    window.scrollX + window.innerWidth - tooltipWidth - viewportPadding;
  left = Math.max(window.scrollX + viewportPadding, Math.min(left, maxLeft));

  let top = cardRect.bottom + window.scrollY + spacing;
  const bottomLimit =
    window.scrollY + window.innerHeight - tooltipHeight - viewportPadding;

  if (top > bottomLimit) {
    top = cardRect.top + window.scrollY - tooltipHeight - spacing;
  }

  top = Math.max(window.scrollY + viewportPadding, top);

  productDescriptionTooltip.style.left = `${left}px`;
  productDescriptionTooltip.style.top = `${top}px`;
}

function showProductDescriptionTooltip(card) {
  const productId = Number(card.dataset.productId);
  const product = getProductById(productId);

  if (!product) {
    return;
  }

  activeTooltipCard = card;
  productDescriptionTooltip.textContent = product.description;
  productDescriptionTooltip.classList.add("is-visible");
  positionProductDescriptionTooltip(card);
}

function hideProductDescriptionTooltip() {
  activeTooltipCard = null;
  productDescriptionTooltip.classList.remove("is-visible");
}

function saveSelectedProducts() {
  const selectedProductIds = selectedProducts.map((product) => product.id);
  localStorage.setItem(
    selectedProductsStorageKey,
    JSON.stringify(selectedProductIds),
  );
}

function getSavedSelectedProductIds() {
  const savedValue = localStorage.getItem(selectedProductsStorageKey);

  if (!savedValue) {
    return [];
  }

  try {
    const parsedProductIds = JSON.parse(savedValue);

    if (!Array.isArray(parsedProductIds)) {
      return [];
    }

    return parsedProductIds.filter((id) => Number.isInteger(id));
  } catch (error) {
    console.error("Could not read saved selected products.", error);
    return [];
  }
}

function restoreSelectedProducts() {
  const savedProductIds = getSavedSelectedProductIds();

  selectedProducts = savedProductIds
    .map((productId) => allProducts.find((product) => product.id === productId))
    .filter(Boolean);

  renderSelectedProducts();
}

function updateProductSelectionStyles() {
  const productCards = productsContainer.querySelectorAll(".product-card");

  productCards.forEach((card) => {
    const productId = Number(card.dataset.productId);
    card.classList.toggle(
      "is-selected",
      Boolean(getSelectedProduct(productId)),
    );
  });
}

function renderSelectedProducts() {
  clearSelectedProductsButton.disabled = selectedProducts.length === 0;

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <p class="placeholder-message">Select products from the list to build a routine.</p>
    `;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <button
          type="button"
          class="selected-product-chip"
          data-remove-product-id="${product.id}"
        >
          ${product.name}
        </button>
      `,
    )
    .join("");
}

function clearSelectedProducts() {
  selectedProducts = [];
  saveSelectedProducts();
  renderSelectedProducts();
  updateProductSelectionStyles();
}

function toggleProductSelection(productId) {
  const existingProduct = getSelectedProduct(productId);

  if (existingProduct) {
    selectedProducts = selectedProducts.filter(
      (product) => product.id !== productId,
    );
  } else {
    const productToAdd = allProducts.find(
      (product) => product.id === productId,
    );

    if (productToAdd) {
      selectedProducts = [...selectedProducts, productToAdd];
    }
  }

  saveSelectedProducts();
  renderSelectedProducts();
  updateProductSelectionStyles();
}

function renderChatMessage(role, content) {
  if (chatWindow.querySelector(".placeholder-message")) {
    chatWindow.innerHTML = "";
  }

  const message = document.createElement("div");
  message.className = `chat-message chat-message-${role}`;
  message.textContent = content;
  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function buildSelectedProductsContext() {
  if (selectedProducts.length === 0) {
    return "No products have been selected yet.";
  }

  return selectedProducts
    .map(
      (product) =>
        `- ${product.name} (${product.brand})\n  Category: ${product.category}\n  Description: ${product.description}`,
    )
    .join("\n");
}

async function sendMessagesToWorker(messages) {
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error(`Worker request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const responseText = await response.text();
  return {
    response: responseText,
  };
}

function buildConversationMessages(question) {
  return [
    {
      role: "system",
      content:
        "You are a helpful L'Oréal routine advisor. Use the selected products and the user's question to recommend a routine, explain product order, and answer follow-up questions clearly. Always base your recommendations on the products selected by the user. If the user asks a question that cannot be answered with the selected products, politely inform them that you can only provide advice based on the products they have chosen, and suggest they select different products if they want advice on something not covered by their current selection.",
    },
    {
      role: "system",
      content: `Selected products:\n${buildSelectedProductsContext()}`,
    },
    ...chatHistory,
    {
      role: "user",
      content: question,
    },
  ];
}

function getWorkerResponseContent(data) {
  const messageContent = data?.choices?.[0]?.message?.content;

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) => part?.text ?? part?.content ?? "")
      .join("")
      .trim();
  }

  if (typeof messageContent === "string") {
    return messageContent;
  }

  const outputText = data?.output_text;

  if (typeof outputText === "string") {
    return outputText;
  }

  if (Array.isArray(outputText)) {
    return outputText.join("").trim();
  }

  const outputContent = data?.output?.[0]?.content;

  if (Array.isArray(outputContent)) {
    return outputContent
      .map((part) => part?.text ?? part?.content ?? "")
      .join("")
      .trim();
  }

  return (
    data?.message?.content ??
    data?.response ??
    data?.answer ??
    JSON.stringify(data, null, 2)
  );
}

function getWorkerFinishReason(data) {
  return (
    data?.choices?.[0]?.finish_reason ??
    data?.finish_reason ??
    data?.response?.status ??
    data?.status ??
    ""
  );
}

function shouldRequestContinuation(partialResponse, finishReason) {
  if (finishReason === "length" || finishReason === "max_tokens") {
    return true;
  }

  const trimmedResponse = partialResponse.trim();

  if (!trimmedResponse) {
    return false;
  }

  return !/[.!?)]$/.test(trimmedResponse);
}

async function getCompleteAssistantResponse(question) {
  let messages = buildConversationMessages(question);
  const responseParts = [];

  for (let attempt = 0; attempt <= maxContinuationRequests; attempt += 1) {
    const data = await sendMessagesToWorker(messages);
    const responsePart = String(getWorkerResponseContent(data) || "").trim();
    const finishReason = String(
      getWorkerFinishReason(data) || "",
    ).toLowerCase();

    if (responsePart) {
      responseParts.push(responsePart);
    }

    if (!shouldRequestContinuation(responsePart, finishReason)) {
      break;
    }

    messages = [
      ...messages,
      { role: "assistant", content: responsePart },
      {
        role: "user",
        content:
          "Continue exactly where you stopped. Do not repeat previous text. Finish the full answer.",
      },
    ];
  }

  return responseParts.join("\n");
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory,
  );

  displayProducts(filteredProducts);
});

productsContainer.addEventListener("click", (e) => {
  const productCard = e.target.closest(".product-card");

  if (!productCard) {
    return;
  }

  toggleProductSelection(Number(productCard.dataset.productId));
});

productsContainer.addEventListener("mouseover", (e) => {
  const productCard = e.target.closest(".product-card");

  if (!productCard) {
    return;
  }

  showProductDescriptionTooltip(productCard);
});

productsContainer.addEventListener("mouseout", (e) => {
  const productCard = e.target.closest(".product-card");

  if (!productCard) {
    return;
  }

  const nextTarget = e.relatedTarget;

  if (nextTarget && productCard.contains(nextTarget)) {
    return;
  }

  hideProductDescriptionTooltip();
});

productsContainer.addEventListener("focusin", (e) => {
  const productCard = e.target.closest(".product-card");

  if (!productCard) {
    return;
  }

  showProductDescriptionTooltip(productCard);
});

productsContainer.addEventListener("focusout", (e) => {
  const productCard = e.target.closest(".product-card");

  if (!productCard) {
    return;
  }

  const nextTarget = e.relatedTarget;

  if (nextTarget && productCard.contains(nextTarget)) {
    return;
  }

  hideProductDescriptionTooltip();
});

productsContainer.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") {
    return;
  }

  const productCard = e.target.closest(".product-card");

  if (!productCard) {
    return;
  }

  e.preventDefault();
  toggleProductSelection(Number(productCard.dataset.productId));
});

selectedProductsList.addEventListener("click", (e) => {
  const removeButton = e.target.closest("[data-remove-product-id]");

  if (!removeButton) {
    return;
  }

  toggleProductSelection(Number(removeButton.dataset.removeProductId));
});

clearSelectedProductsButton.addEventListener("click", () => {
  clearSelectedProducts();
});

window.addEventListener("scroll", () => {
  if (activeTooltipCard) {
    positionProductDescriptionTooltip(activeTooltipCard);
  }
});

window.addEventListener("resize", () => {
  if (activeTooltipCard) {
    positionProductDescriptionTooltip(activeTooltipCard);
  }
});

generateRoutineButton.addEventListener("click", () => {
  if (selectedProducts.length === 0) {
    chatWindow.innerHTML = `
      <div class="placeholder-message">
        Select at least one product first, then generate a routine.
      </div>
    `;
    return;
  }

  userInput.value = "Create a personalized routine using my selected products.";
  chatForm.requestSubmit();
});

/* Chat form submission handler - sends the question to the Cloudflare Worker */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const question = userInput.value.trim();

  if (!question) {
    return;
  }

  userInput.value = "";
  renderChatMessage("user", question);
  renderChatMessage("assistant", "Thinking...");

  const loadingMessage = chatWindow.lastElementChild;

  try {
    const workerResponse = await getCompleteAssistantResponse(question);

    chatHistory = [
      ...chatHistory,
      { role: "user", content: question },
      { role: "assistant", content: workerResponse },
    ];

    loadingMessage.textContent = workerResponse;
  } catch (error) {
    loadingMessage.textContent =
      "Sorry, I could not reach the routine worker right now. Please try again.";
    console.error(error);
  }
});

loadProducts().then(() => {
  restoreSelectedProducts();
});
