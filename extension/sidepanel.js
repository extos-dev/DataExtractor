// extension/sidepanel.ts
var currentMode = "default";
var currentPageInfo = null;
var currentSchemas = [];
var selectedElement = null;
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((tc) => tc.classList.remove("active"));
    tab.classList.add("active");
    const tabId = tab.getAttribute("data-tab");
    document.getElementById(`tab-${tabId}`)?.classList.add("active");
  });
});
var modeToggle = document.getElementById("modeToggle");
modeToggle?.addEventListener("click", async () => {
  currentMode = currentMode === "default" ? "edit" : "default";
  modeToggle.classList.toggle("active", currentMode === "edit");
  document.getElementById("currentMode").textContent = currentMode === "edit" ? "Edit (Inspect)" : "Default";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, {
    action: "SET_MODE",
    mode: currentMode
  }, (resp) => {
    const status = document.getElementById("inspect-status");
    if (status) {
      if (currentMode === "edit") {
        status.innerHTML = "\u{1F50D} <strong>Edit Mode Active:</strong> Hover and click elements on the page to inspect";
      } else {
        status.innerHTML = "";
      }
    }
  });
});
async function loadPageInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { action: "GET_PAGE_INFO" }, (resp) => {
    if (resp?.success) {
      currentPageInfo = resp.pageInfo;
      currentSchemas = resp.schemas || [];
      updatePageInfoDisplay();
      updateSchemasDisplay();
    }
  });
}
function updatePageInfoDisplay() {
  const container = document.getElementById("pageInfo");
  if (!container || !currentPageInfo) return;
  const pageType = currentPageInfo.pageType || "unknown";
  const confidence = currentPageInfo.classification?.confidence ? Math.round(currentPageInfo.classification.confidence * 100) + "%" : "N/A";
  container.innerHTML = `
    <div class="info-row">
      <span class="info-label">Site</span>
      <span class="info-value">${currentPageInfo.domain || "N/A"}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Page Type</span>
      <span class="info-value">${pageType.replace("_", " ").toUpperCase()}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Confidence</span>
      <span class="info-value">${confidence}</span>
    </div>
    <div class="info-row">
      <span class="info-label">URL</span>
      <span class="info-value" title="${currentPageInfo.url}">${currentPageInfo.url?.substring(0, 40)}...</span>
    </div>
    <div class="info-row">
      <span class="info-label">Title</span>
      <span class="info-value" title="${currentPageInfo.title}">${currentPageInfo.title?.substring(0, 35)}...</span>
    </div>
  `;
}
function updateSchemasDisplay() {
  const container = document.getElementById("schemasList");
  if (!container) return;
  if (currentSchemas.length === 0) {
    container.innerHTML = '<div style="font-size: 11px; color: #6b7280;">No schemas yet. Run auto-detect or create manually.</div>';
    return;
  }
  container.innerHTML = currentSchemas.map((schema) => `
    <div class="schema-item" data-schema-id="${schema.id}">
      <div class="schema-name">
        ${schema.name}
        <span class="schema-badge ${schema.source === "auto" ? "badge-auto" : "badge-manual"}">
          ${schema.source === "auto" ? "AUTO" : "MANUAL"}
        </span>
      </div>
      <div class="schema-meta">
        ${schema.domain || schema.pageType || "Global"} \u2022 ${new Date(schema.createdAt).toLocaleDateString()}
      </div>
    </div>
  `).join("");
  container.querySelectorAll(".schema-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const schemaId = item.getAttribute("data-schema-id");
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      chrome.tabs.sendMessage(tab.id, {
        action: "EXTRACT_WITH_SCHEMA",
        schemaId
      }, (resp) => {
        if (resp?.success) {
          const out = document.getElementById("snapshotOutput");
          if (out) {
            out.textContent = resp.result.markdown || resp.result.text || JSON.stringify(resp.result, null, 2);
            document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach((tc) => tc.classList.remove("active"));
            document.querySelector('.tab[data-tab="snapshot"]')?.classList.add("active");
            document.getElementById("tab-snapshot")?.classList.add("active");
          }
        }
      });
    });
  });
}
document.getElementById("autoDetectBtn")?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { action: "RUN_DETECTION" }, (resp) => {
    if (resp?.success) {
      loadPageInfo();
    }
  });
});
document.getElementById("createSchemaBtn")?.addEventListener("click", async () => {
  if (currentMode !== "edit") {
    alert("Switch to Edit mode to select an element");
    currentMode = "edit";
    modeToggle?.classList.add("active");
    document.getElementById("currentMode").textContent = "Edit (Inspect)";
    const [tab2] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab2) {
      chrome.tabs.sendMessage(tab2.id, { action: "SET_MODE", mode: "edit" });
    }
    return;
  }
  if (!selectedElement) {
    alert("Click on an element in the page first to select it");
    return;
  }
  const name = prompt("Schema name:", "Custom Extraction");
  if (!name) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, {
    action: "CREATE_SCHEMA",
    name,
    element: selectedElement.selector
  }, (resp) => {
    if (resp?.success) {
      loadPageInfo();
      alert("Schema created successfully!");
    }
  });
});
document.getElementById("refreshTreeBtn")?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { action: "GET_DOM_TREE" }, (resp) => {
    if (resp?.success && resp.tree) {
      renderDomTree(resp.tree, document.getElementById("domTree"));
    }
  });
});
function renderDomTree(node, container, depth = 0) {
  if (!node) return;
  const div = document.createElement("div");
  div.className = "tree-node";
  div.style.paddingLeft = depth * 12 + "px";
  let html = '<span class="tree-indent">\u2514\u2500</span> ';
  html += `<span class="tree-tag">&lt;${node.tagName}&gt;</span>`;
  if (node.id) html += ` <span class="tree-id">#${node.id}</span>`;
  if (node.className) html += ` <span class="tree-class">.${node.className.split(" ")[0]}</span>`;
  div.innerHTML = html;
  div.title = node.textContent || "";
  div.addEventListener("click", async (e) => {
    e.stopPropagation();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { action: "HIGHLIGHT_ELEMENT", selector: node.selector });
  });
  container.appendChild(div);
  if (node.children) {
    for (const child of node.children) {
      renderDomTree(child, container, depth + 1);
    }
  }
}
document.getElementById("generateSnapshotBtn")?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, { action: "RUN_DETECTION" }, (resp) => {
    const out = document.getElementById("snapshotOutput");
    if (out && resp?.nodes) {
      const snapshot = {
        page: currentPageInfo,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        extractions: resp.nodes
      };
      out.textContent = JSON.stringify(snapshot, null, 2);
    }
  });
});
document.getElementById("copySnapshotBtn")?.addEventListener("click", () => {
  const out = document.getElementById("snapshotOutput");
  if (out) {
    navigator.clipboard.writeText(out.textContent);
  }
});
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "PAGE_INFO_UPDATED") {
    currentPageInfo = message.payload.pageInfo;
    currentSchemas = message.payload.schemas || [];
    updatePageInfoDisplay();
    updateSchemasDisplay();
  }
  if (message.action === "ELEMENT_SELECTED") {
    selectedElement = message.payload.element;
    const status = document.getElementById("inspect-status");
    if (status && selectedElement) {
      status.innerHTML = `\u2705 Selected: &lt;${selectedElement.tagName}&gt; ${selectedElement.selector || ""} - Click "Create Manual Schema" to save`;
    }
  }
  if (message.action === "SCHEMAS_UPDATED") {
    currentSchemas = message.payload.schemas || [];
    updateSchemasDisplay();
  }
});
loadPageInfo();
setTimeout(loadPageInfo, 1e3);
