/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineButton = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const workerUrl = "https://still-union-bereaved.wjscata.workers.dev/"; // Replace with your Cloudflare Worker URL

let allProducts = [];
let selectedProducts = [];
let chatHistory = [];

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

async function sendQuestionToWorker(question) {
  const messages = [
    {
      role: "system",
      content:
        "You are a helpful L'Oréal routine advisor. Use the selected products and the user's question to recommend a routine, explain product order, and answer follow-up questions clearly.",
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

function getWorkerResponseContent(data) {
  return (
    data?.choices?.[0]?.message?.content ??
    data?.message?.content ??
    data?.response ??
    data?.answer ??
    JSON.stringify(data, null, 2)
  );
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
    const data = await sendQuestionToWorker(question);
    const workerResponse = getWorkerResponseContent(data);

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
  renderSelectedProducts();
});
