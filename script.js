let uploadedData = [];
let uploadedHeaders = [];
let cb1Chart = null;

// =========================
// Template Downloads
// =========================

function downloadSimpleTemplate() {
  const csvContent =
`SKU,Description,CurrentStock,MonthlyDemand,LeadTimeDays
A,Item A,100,300,10
B,Item B,50,200,15`;

  downloadCsv(csvContent, "cb1-simple-template.csv");
}

function downloadAdvancedTemplate() {
  const csvContent =
`SKU,Description,CurrentStock,LeadTimeDays,OnOrderQty,UnitCost,Supplier,MOQ,OrderMultiple,M1,M2,M3
A,Item A,100,10,0,2.50,Supplier A,0,1,200,250,300
B,Item B,50,15,20,4.20,Supplier B,50,10,150,200,250`;

  downloadCsv(csvContent, "cb1-advanced-template.csv");
}

function downloadCsv(content, fileName) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// =========================
// Helpers
// =========================

function parseCsvLine(line) {
  return line.split(",").map(cell => cell.trim());
}

function roundUpToMultiple(value, multiple) {
  if (!multiple || multiple <= 1) return Math.ceil(value);
  return Math.ceil(value / multiple) * multiple;
}

function calculateTopUpOrderQty(currentStockPosition, maxStockLevel, moq, orderMultiple) {
  const minOrder = moq > 0 ? moq : 1;
  let orderQty = Math.max(0, maxStockLevel - currentStockPosition);

  if (orderQty > 0) {
    orderQty = Math.max(orderQty, minOrder);
    orderQty = roundUpToMultiple(orderQty, orderMultiple || 1);
  }

  return Math.ceil(orderQty);
}

function formatDateLabel(date) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short"
  });
}

function buildProjectionData(effectiveStock, forecast, safetyStock, leadTimeDays, moq, orderMultiple) {
  const startDate = new Date();
  const labels = [formatDateLabel(startDate)];
  const projectedStock = [Number(effectiveStock.toFixed(1))];
  const guidedStock = [Number(effectiveStock.toFixed(1))];
  const safetyLine = [Number(safetyStock.toFixed(1))];
  const replenishmentMarkers = [null];

  const dailyDemand = forecast / 30;
  const totalDays = Math.max(30, leadTimeDays * 2);

  const reorderPoint = (dailyDemand * leadTimeDays) + safetyStock;
  const maxStockLevel = reorderPoint + forecast;
  const maxLine = [Number(maxStockLevel.toFixed(1))];

  let noActionStock = effectiveStock;
  let guidedCurrentStock = effectiveStock;
  let pendingDelivery = null;

  for (let day = 1; day <= totalDays; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + day);
    labels.push(formatDateLabel(currentDate));

    // No action projection
    noActionStock -= dailyDemand;
    projectedStock.push(Number(Math.max(0, noActionStock).toFixed(1)));

    // Receive pending delivery if due
    if (pendingDelivery && pendingDelivery.day === day) {
      guidedCurrentStock += pendingDelivery.qty;
      pendingDelivery = null;
    }

    // Consume daily demand
    guidedCurrentStock -= dailyDemand;

    let markerValue = null;

    // Trigger replenishment when stock breaches reorder point
    if (guidedCurrentStock <= reorderPoint && !pendingDelivery) {
      const orderQty = calculateTopUpOrderQty(
        guidedCurrentStock,
        maxStockLevel,
        moq,
        orderMultiple
      );

      pendingDelivery = {
        day: day + leadTimeDays,
        qty: orderQty
      };

      markerValue = Math.max(0, guidedCurrentStock);
    }

    guidedStock.push(Number(Math.max(0, guidedCurrentStock).toFixed(1)));
    replenishmentMarkers.push(markerValue !== null ? Number(markerValue.toFixed(1)) : null);
    safetyLine.push(Number(safetyStock.toFixed(1)));
    maxLine.push(Number(maxStockLevel.toFixed(1)));
  }

  return {
    labels,
    projectedStock,
    guidedStock,
    safetyLine,
    maxLine,
    replenishmentMarkers,
    reorderPoint: Number(reorderPoint.toFixed(1)),
    maxStockLevel: Number(maxStockLevel.toFixed(1))
  };
}

function renderProjectionChart(canvasId, projectionData) {
  const ctx = document.getElementById(canvasId);

  if (!ctx) return;

  if (cb1Chart) {
    cb1Chart.destroy();
  }

  cb1Chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: projectionData.labels,
      datasets: [
        {
          label: "Projected Stock (No Action)",
          data: projectionData.projectedStock,
          borderColor: "#60a5fa",
          backgroundColor: "rgba(96,165,250,0.12)",
          tension: 0.2,
          fill: false
        },
        {
          label: "Projected Stock (Guided Replenishment)",
          data: projectionData.guidedStock,
          borderColor: "#22c55e",
          borderDash: [8, 6],
          tension: 0.2,
          fill: false
        },
        {
          label: "Suggested Replenishment Trigger",
          data: projectionData.replenishmentMarkers,
          borderColor: "#22c55e",
          backgroundColor: "#22c55e",
          pointRadius: 5,
          pointHoverRadius: 6,
          showLine: false
        },
        {
          label: "Safety Stock (Min)",
          data: projectionData.safetyLine,
          borderColor: "#ef4444",
          borderDash: [6, 6],
          tension: 0,
          fill: false
        },
        {
          label: "Max Stock Level",
          data: projectionData.maxLine,
          borderColor: "#f59e0b",
          borderDash: [6, 6],
          tension: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#e2e8f0"
          }
        },
        tooltip: {
          callbacks: {
            title: function(context) {
              return `Date: ${context[0].label}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#e2e8f0",
            autoSkip: true,
            maxTicksLimit: 10,
            maxRotation: 0,
            minRotation: 0
          },
          grid: {
            color: "rgba(255,255,255,0.08)"
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#e2e8f0"
          },
          grid: {
            color: "rgba(255,255,255,0.08)"
          }
        }
      }
    }
  });
}

function getDynamicMessage(urgent, low, total) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  if (urgent === total && total > 0) {
    return pick([
      "Right. Let’s not pretend this is fine.",
      "This is a mess.",
      "We need to talk. Immediately.",
      "You’ve achieved full chaos.",
      "Let’s call this… a rebuild."
    ]);
  }

  if (urgent > 0) {
    return pick([
      "Houston..."
    ]);
  }

  if (low > 0) {
    return pick([
      "Don’t leave this to chance."
    ]);
  }

  return pick([
    "Nice Work!."
  ]);
}

// =========================
// Upload / Reset
// =========================

function resetTool() {
  uploadedData = [];
  uploadedHeaders = [];
  document.getElementById("fileInput").value = "";
  document.getElementById("uploadStatus").innerHTML = "";
  document.getElementById("goldOverviewPanel").innerHTML = "Upload a file to generate the overview.";
  document.getElementById("cb1Panel").innerHTML = "Select a SKU to load the CB1 view.";
}

function handleUpload() {
  const file = document.getElementById("fileInput").files[0];

  if (!file) {
    document.getElementById("uploadStatus").innerHTML = "Please upload a CSV file.";
    return;
  }

  const reader = new FileReader();

  reader.onload = function(event) {
    const text = event.target.result.trim();
    const rows = text.split(/\r?\n/).map(parseCsvLine);

    if (rows.length < 2) {
      document.getElementById("uploadStatus").innerHTML = "The CSV looks empty.";
      return;
    }

    const headers = rows[0];
    const data = rows.slice(1);

    const requiredSimple = ["SKU", "Description", "CurrentStock", "LeadTimeDays"];
    const hasMonthlyDemand = headers.includes("MonthlyDemand");
    const hasHistory = headers.includes("M1") && headers.includes("M2") && headers.includes("M3");

    for (const col of requiredSimple) {
      if (!headers.includes(col)) {
        document.getElementById("uploadStatus").innerHTML = `Missing required column: ${col}`;
        return;
      }
    }

    if (!hasMonthlyDemand && !hasHistory) {
      document.getElementById("uploadStatus").innerHTML =
        "You need either MonthlyDemand or history columns M1, M2, M3.";
      return;
    }

    uploadedHeaders = headers;
    uploadedData = data.filter(row => row.length > 0 && row.some(cell => cell !== ""));

    document.getElementById("uploadStatus").innerHTML =
      `File loaded: ${uploadedData.length} SKU rows ready. Search to begin.`;

    renderGoldOverview();
    document.getElementById("cb1Panel").innerHTML = "Select a SKU from the Gold Overview table to load the CB1 view.";
  };

  reader.readAsText(file);
}

function calculateOverviewMetrics(row) {
  const get = (name) => {
    const idx = uploadedHeaders.indexOf(name);
    return idx >= 0 ? row[idx] : "";
  };

  const sku = get("SKU");
  const description = get("Description");
  const stock = parseFloat(get("CurrentStock"));
  const lead = parseFloat(get("LeadTimeDays"));
  const onOrderQty = parseFloat(get("OnOrderQty")) || 0;
  const unitCost = parseFloat(get("UnitCost")) || 0;

  let forecast = 0;

  const hasHistory =
    uploadedHeaders.includes("M1") &&
    uploadedHeaders.includes("M2") &&
    uploadedHeaders.includes("M3");

  if (hasHistory) {
    const m1 = parseFloat(get("M1")) || 0;
    const m2 = parseFloat(get("M2")) || 0;
    const m3 = parseFloat(get("M3")) || 0;
    forecast = (m1 + m2 + m3) / 3;
  } else {
    forecast = parseFloat(get("MonthlyDemand"));
  }

  if (isNaN(stock) || isNaN(lead) || isNaN(forecast) || forecast <= 0) {
    return null;
  }

  const daily = forecast / 30;
  const safetyDays = 7;

  let safetyStock = daily * safetyDays;
  const uploadedSafety = parseFloat(get("SafetyStock"));
  if (!isNaN(uploadedSafety) && uploadedSafety > 0) {
    safetyStock = uploadedSafety;
  }

  const effectiveStock = stock + onOrderQty;
  const reorderPoint = (daily * lead) + safetyStock;
  const maxStockLevel = reorderPoint + forecast;

  const moq = parseFloat(get("MOQ")) || 0;
  const orderMultiple = parseFloat(get("OrderMultiple")) || 1;

  const suggestedOrderQty = calculateTopUpOrderQty(
    effectiveStock,
    maxStockLevel,
    moq,
    orderMultiple
  );

  let projectedStock = effectiveStock;
  let day = 0;
  let runoutDay = null;

  while (projectedStock > 0 && day < 365) {
    projectedStock -= daily;
    day++;
    if (projectedStock <= 0 && runoutDay === null) {
      runoutDay = day;
    }
  }

  const daysToStockout = runoutDay || 999;

  let status = "OK";
  let color = "#22c55e";

  if (daysToStockout < lead) {
    status = "URGENT";
    color = "#ef4444";
  } else if (daysToStockout < lead + safetyDays) {
    status = "LOW";
    color = "#f59e0b";
  }

  return {
    sku,
    description,
    effectiveStock,
    forecast,
    lead,
    reorderPoint,
    suggestedOrderQty,
    daysToStockout,
    status,
    color,
    estimatedSpend: unitCost > 0 ? suggestedOrderQty * unitCost : null
  };
}

function renderGoldOverview() {
  const existingSearch = document.getElementById("skuSearch") ? document.getElementById("skuSearch").value : "";
  if (!uploadedData.length) {
    document.getElementById("goldOverviewPanel").innerHTML = "Upload a file to generate the overview.";
    return;
  }

  const overviewRows = uploadedData
    .map(calculateOverviewMetrics)
    .filter(row => row !== null)
    .sort((a, b) => {
      const priority = { URGENT: 0, LOW: 1, OK: 2 };
      const statusDiff = priority[a.status] - priority[b.status];
      if (statusDiff !== 0) return statusDiff;
      return a.daysToStockout - b.daysToStockout;
    });

  const urgentCount = overviewRows.filter(x => x.status === "URGENT").length;
  const lowCount = overviewRows.filter(x => x.status === "LOW").length;
  const okCount = overviewRows.filter(x => x.status === "OK").length;
  const totalSpend = overviewRows.reduce((sum, x) => sum + (x.estimatedSpend || 0), 0);

  let html = `
    let html = `
    <div style="margin-bottom:15px;">
      <input
        type="text"
        id="skuSearch"
        placeholder="Filter by SKU or description..."
        value="${existingSearch}"
        oninput="handleSearch()"
        style="margin-top:0;"
      >
      <div class="muted">Click any row to load the CB1 drilldown.</div>
    </div>

    <div class="summary-strip">
      <div class="summary-card">
        <h4>Total Valid SKUs</h4>
        <p>${overviewRows.length}</p>
      </div>
      <div class="summary-card">
        <h4>URGENT</h4>
        <p style="color:#ef4444;">${urgentCount}</p>
      </div>
      <div class="summary-card">
        <h4>LOW</h4>
        <p style="color:#f59e0b;">${lowCount}</p>
      </div>
      <div class="summary-card">
        <h4>OK</h4>
        <p style="color:#22c55e;">${okCount}</p>
      </div>
      <div class="summary-card">
        <h4>Total Suggested Spend</h4>
        <p>£${totalSpend.toFixed(2)}</p>
      </div>
    </div>
  `;

  if (!overviewRows.length) {
    html += `<p class="muted">No valid SKU rows found for overview.</p>`;
    document.getElementById("goldOverviewPanel").innerHTML = html;
    return;
  }

  html += `
    <div class="table-wrap">
      <table>
        <tr>
          <th>SKU</th>
          <th>Description</th>
          <th>Status</th>
          <th>Effective Stock</th>
          <th>Forecast</th>
          <th>Lead Time</th>
          <th>Reorder Point</th>
          <th>Suggested Order Qty</th>
          <th>Days to Stockout</th>
          <th>Est. Spend</th>
        </tr>
  `;

  overviewRows.slice(0, 20).forEach(overviewRow => {
    const sourceRow = uploadedData.find(row => {
      const skuIndex = uploadedHeaders.indexOf("SKU");
      const descIndex = uploadedHeaders.indexOf("Description");
      const sku = skuIndex >= 0 ? row[skuIndex] : "";
      const desc = descIndex >= 0 ? row[descIndex] : "";
      return sku === overviewRow.sku && desc === overviewRow.description;
    });

    const safeRow = sourceRow ? encodeURIComponent(JSON.stringify(sourceRow)) : "";

    html += `
      <tr class="result-row" ${safeRow ? `onclick="selectSKU('${safeRow}')"` : ""}>
        <td>${overviewRow.sku}</td>
        <td>${overviewRow.description}</td>
        <td style="color:${overviewRow.color}; font-weight:bold;">${overviewRow.status}</td>
        <td>${Math.ceil(overviewRow.effectiveStock)}</td>
        <td>${Math.ceil(overviewRow.forecast)}</td>
        <td>${overviewRow.lead}</td>
        <td>${Math.ceil(overviewRow.reorderPoint)}</td>
        <td>${Math.ceil(overviewRow.suggestedOrderQty)}</td>
        <td>${overviewRow.daysToStockout}</td>
        <td>${overviewRow.estimatedSpend !== null ? "£" + overviewRow.estimatedSpend.toFixed(2) : "N/A"}</td>
      </tr>
    `;
  });

  html += `
      </table>
    </div>
    <p class="muted">Showing top 20 SKUs by urgency. Click any row to load the CB1 drilldown.</p>
  `;

  document.getElementById("goldOverviewPanel").innerHTML = html;
}

function renderGoldOverviewFiltered(filteredRows) {
  const existingSearch = document.getElementById("skuSearch") ? document.getElementById("skuSearch").value : "";
  const overviewRows = filteredRows
    .map(calculateOverviewMetrics)
    .filter(row => row !== null)
    .sort((a, b) => {
      const priority = { URGENT: 0, LOW: 1, OK: 2 };
      const statusDiff = priority[a.status] - priority[b.status];
      if (statusDiff !== 0) return statusDiff;
      return a.daysToStockout - b.daysToStockout;
    });

  if (!overviewRows.length) {
    document.getElementById("goldOverviewPanel").innerHTML =
      "<p class='muted'>No matching SKUs found.</p>";
    return;
  }

  let html = `
    <div style="margin-bottom:15px;">
      <input
        type="text"
        id="skuSearch"
        placeholder="Filter by SKU or description..."
        value="${existingSearch}"
        oninput="handleSearch()"
        style="margin-top:0;"
      >
      <div class="muted">Click any row to load the CB1 drilldown.</div>
    </div>

    <div class="table-wrap">
      <table>
        <tr>
          <th>SKU</th>
          <th>Description</th>
          <th>Status</th>
          <th>Effective Stock</th>
          <th>Forecast</th>
          <th>Lead Time</th>
          <th>Reorder Point</th>
          <th>Suggested Order Qty</th>
          <th>Days to Stockout</th>
          <th>Est. Spend</th>
        </tr>
  `;

  overviewRows.forEach(overviewRow => {
    const sourceRow = uploadedData.find(row => {
      const skuIndex = uploadedHeaders.indexOf("SKU");
      const descIndex = uploadedHeaders.indexOf("Description");
      const sku = skuIndex >= 0 ? row[skuIndex] : "";
      const desc = descIndex >= 0 ? row[descIndex] : "";
      return sku === overviewRow.sku && desc === overviewRow.description;
    });

    const safeRow = sourceRow ? encodeURIComponent(JSON.stringify(sourceRow)) : "";

    html += `
      <tr class="result-row" ${safeRow ? `onclick="selectSKU('${safeRow}')"` : ""}>
        <td>${overviewRow.sku}</td>
        <td>${overviewRow.description}</td>
        <td style="color:${overviewRow.color}; font-weight:bold;">${overviewRow.status}</td>
        <td>${Math.ceil(overviewRow.effectiveStock)}</td>
        <td>${Math.ceil(overviewRow.forecast)}</td>
        <td>${overviewRow.lead}</td>
        <td>${Math.ceil(overviewRow.reorderPoint)}</td>
        <td>${Math.ceil(overviewRow.suggestedOrderQty)}</td>
        <td>${overviewRow.daysToStockout}</td>
        <td>${overviewRow.estimatedSpend !== null ? "£" + overviewRow.estimatedSpend.toFixed(2) : "N/A"}</td>
      </tr>
    `;
  });

  html += `
      </table>
    </div>
  `;

  document.getElementById("goldOverviewPanel").innerHTML = html;
}

// =========================
// Search / Results
// =========================

function handleSearch() {
  if (!uploadedData.length) return;

  const query = document.getElementById("skuSearch").value.toLowerCase();

  if (!query) {
    renderGoldOverview();
    return;
  }

  const filteredData = uploadedData.filter(row => {
    const skuIndex = uploadedHeaders.indexOf("SKU");
    const descIndex = uploadedHeaders.indexOf("Description");

    const sku = skuIndex >= 0 ? (row[skuIndex] || "").toLowerCase() : "";
    const desc = descIndex >= 0 ? (row[descIndex] || "").toLowerCase() : "";

    return sku.includes(query) || desc.includes(query);
  });

  renderGoldOverviewFiltered(filteredData);
}

function renderResultsTable(rows) {
  const skuIndex = uploadedHeaders.indexOf("SKU");
  const descIndex = uploadedHeaders.indexOf("Description");

  if (!rows.length) {
    document.getElementById("resultsPanel").innerHTML = "No matching SKUs found.";
    return;
  }

  let html = "<div class='table-wrap'><table><tr><th>SKU</th><th>Description</th></tr>";

  rows.forEach(row => {
    const sku = row[skuIndex] || "";
    const desc = row[descIndex] || "";
    const safeRow = encodeURIComponent(JSON.stringify(row));

    html += `
      <tr class="result-row" onclick="selectSKU('${safeRow}')">
        <td>${sku}</td>
        <td>${desc}</td>
      </tr>
    `;
  });

  html += "</table></div>";
  document.getElementById("resultsPanel").innerHTML = html;
}

function selectSKU(encodedRow) {
  const row = JSON.parse(decodeURIComponent(encodedRow));
  runSingleSKU(row);
}

// =========================
// CB1 Single SKU View
// =========================

function runSingleSKU(row) {
  const get = (name) => {
    const idx = uploadedHeaders.indexOf(name);
    return idx >= 0 ? row[idx] : "";
  };

  const sku = get("SKU");
  const description = get("Description");
  const stock = parseFloat(get("CurrentStock"));
  const lead = parseFloat(get("LeadTimeDays"));
  const onOrderQty = parseFloat(get("OnOrderQty")) || 0;
  const rawUnitCost = parseFloat(get("UnitCost"));
  const unitCost = isNaN(rawUnitCost) ? 0 : rawUnitCost;
  const moq = parseFloat(get("MOQ")) || 0;
  const orderMultiple = parseFloat(get("OrderMultiple")) || 1;

  let forecast = 0;
  let forecastMethod = "";

  const hasHistory = uploadedHeaders.includes("M1") && uploadedHeaders.includes("M2") && uploadedHeaders.includes("M3");

  if (hasHistory) {
    const m1 = parseFloat(get("M1")) || 0;
    const m2 = parseFloat(get("M2")) || 0;
    const m3 = parseFloat(get("M3")) || 0;
    forecast = (m1 + m2 + m3) / 3;
    forecastMethod = "3-month average";
  } else {
    forecast = parseFloat(get("MonthlyDemand"));
    forecastMethod = "manual monthly demand";
  }

  if (isNaN(stock) || isNaN(lead) || isNaN(forecast) || forecast <= 0) {
    document.getElementById("cb1Panel").innerHTML = "This SKU does not have valid data.";
    return;
  }

  const daily = forecast / 30;
  const safetyDays = 7;

  let recommendedSafetyStock = daily * safetyDays;
  const uploadedSafety = parseFloat(get("SafetyStock"));
  if (!isNaN(uploadedSafety) && uploadedSafety > 0) {
    recommendedSafetyStock = uploadedSafety;
  }

  const effectiveStock = stock + onOrderQty;
  const reorderPoint = (daily * lead) + recommendedSafetyStock;
  const maxStockLevel = reorderPoint + forecast;
  
  let reorderQty = calculateTopUpOrderQty(
    effectiveStock,
    maxStockLevel,
    moq,
    orderMultiple
  );

  let projectedStock = effectiveStock;
  let day = 0;
  let runoutDay = null;

  while (projectedStock > 0 && day < 365) {
    projectedStock -= daily;
    day++;
    if (projectedStock <= 0 && runoutDay === null) {
      runoutDay = day;
    }
  }

  const daysToStockout = runoutDay || 999;

  let status = "OK";
  let color = "#22c55e";

  if (daysToStockout < lead) {
    status = "URGENT";
    color = "#ef4444";
  } else if (daysToStockout < lead + safetyDays) {
    status = "LOW";
    color = "#f59e0b";
  }

  const message = getDynamicMessage(status === "URGENT" ? 1 : 0, status === "LOW" ? 1 : 0, 1);
  const spend = unitCost > 0 ? "£" + (reorderQty * unitCost).toFixed(2) : "N/A";

  const reason =
    `You will run out in ${daysToStockout} days. ` +
    `Lead time is ${lead} days. ` +
    `Safety buffer is ${Math.ceil(recommendedSafetyStock)} units. ` +
    `CB1 recommends topping stock back up toward ${Math.ceil(maxStockLevel)} units. ` +
    `Forecast based on ${forecastMethod}.`;

  const projectionData = buildProjectionData(
  effectiveStock,
  forecast,
  recommendedSafetyStock,
  lead,
  moq,
  orderMultiple
);

let safetyBreachDay = projectionData.projectedStock.findIndex((v, i) => i > 0 && v < recommendedSafetyStock);
let zeroBreachDay = projectionData.projectedStock.findIndex((v, i) => i > 0 && v <= 0);
const horizonLabel = `${projectionData.labels.length - 1} day${projectionData.labels.length - 1 > 1 ? "s" : ""}`;

const safetyBreachLabel = safetyBreachDay >= 0 ? projectionData.labels[safetyBreachDay] : null;
const zeroBreachLabel = zeroBreachDay >= 0 ? projectionData.labels[zeroBreachDay] : null;

const breachText = `
  ${
    safetyBreachLabel
      ? `Without action, stock breaches safety stock on ${safetyBreachLabel}`
      : `Without action, stock stays above safety stock across the ${horizonLabel} view.`
  }
  ${
    zeroBreachLabel
      ? `and reaches zero on ${zeroBreachLabel}.`
      : `and, stock does not hit zero across the ${horizonLabel} view.`
  }
  The dashed green line shows guided replenishment using CB1’s min/max logic, topping stock back up toward the target max level after lead time.
`;

const html = `
  <h3>${sku} - ${description}</h3>

  <div class="summary-strip">
    <div class="summary-card">
      <h4>Status</h4>
      <p style="color:${color};">${status}</p>
    </div>
    <div class="summary-card">
      <h4>Forecast</h4>
      <p>${forecast.toFixed(0)}</p>
    </div>
    <div class="summary-card">
      <h4>Days to Stockout</h4>
      <p>${daysToStockout}</p>
    </div>
    <div class="summary-card">
      <h4>Suggested Order Qty</h4>
      <p>${Math.ceil(reorderQty)}</p>
    </div>
    <div class="summary-card">
      <h4>Estimated Spend</h4>
      <p>${spend}</p>
    </div>
    <div class="summary-card">
      <h4>Safety Stock</h4>
      <p>${Math.ceil(recommendedSafetyStock)}</p>
    </div>
  </div>

  <div class="signal-box" style="color:${color}; border:1px solid ${color};">
    ${message}
  </div>

  <div class="panel" style="margin-top:15px;">
    <h3 style="margin-top:0;">Projection</h3>
    <div style="height:320px;">
      <canvas id="projectionChart"></canvas>
    </div>
    <p class="muted">${breachText}</p>
  </div>

  <div class="table-wrap">
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Current Stock</td><td>${stock}</td></tr>
      <tr><td>On Order Qty</td><td>${onOrderQty}</td></tr>
      <tr><td>Effective Stock</td><td>${effectiveStock}</td></tr>
      <tr><td>Lead Time Days</td><td>${lead}</td></tr>
      <tr><td>Forecast</td><td>${forecast.toFixed(0)} per month</td></tr>
      <tr><td>Forecast Method</td><td>${forecastMethod}</td></tr>
      <tr><td>Reorder Point</td><td>${Math.ceil(reorderPoint)}</td></tr>
      <tr><td>Max Stock Level</td><td>${Math.ceil(maxStockLevel)}</td></tr>
      <tr><td>MOQ</td><td>${moq || "-"}</td></tr>
      <tr><td>Order Multiple</td><td>${orderMultiple || "-"}</td></tr>
      <tr><td class="reason">Reason</td><td class="reason">${reason}</td></tr>
    </table>
  </div>
`;

document.getElementById("cb1Panel").innerHTML = html;
renderProjectionChart("projectionChart", projectionData);
}
