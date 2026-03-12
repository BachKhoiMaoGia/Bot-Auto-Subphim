const MAX_FILES = 30;

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const processBtn = document.getElementById("processBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const clearBtn = document.getElementById("clearBtn");
const resultBody = document.getElementById("resultBody");

let selectedFiles = [];
let processedResults = [];

const pad = (num, len = 2) => String(num).padStart(len, "0");

function parseTimestampToMs(ts) {
  const match = ts.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) {
    throw new Error(`Timestamp khong hop le: ${ts}`);
  }
  const [, hh, mm, ss, ms] = match;
  return Number(hh) * 3600000 + Number(mm) * 60000 + Number(ss) * 1000 + Number(ms);
}

function msToTimestamp(totalMs) {
  const safeMs = Math.max(0, Math.round(totalMs));
  const hh = Math.floor(safeMs / 3600000);
  const mm = Math.floor((safeMs % 3600000) / 60000);
  const ss = Math.floor((safeMs % 60000) / 1000);
  const ms = safeMs % 1000;
  return `${pad(hh)}:${pad(mm)}:${pad(ss)},${pad(ms, 3)}`;
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseSrt(rawText) {
  const text = normalizeLineEndings(rawText).trim();
  if (!text) {
    return [];
  }

  const chunks = text.split(/\n\s*\n/);
  const entries = [];

  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    if (lines.length < 2) {
      continue;
    }

    const hasIndexLine = /^\d+$/.test(lines[0].trim());
    const timeLine = hasIndexLine ? lines[1] : lines[0];
    const textStartIndex = hasIndexLine ? 2 : 1;

    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
    if (!timeMatch) {
      continue;
    }

    const startMs = parseTimestampToMs(timeMatch[1]);
    const endMs = parseTimestampToMs(timeMatch[2]);
    const captionLines = lines.slice(textStartIndex);

    entries.push({
      startMs,
      endMs,
      lines: captionLines.length > 0 ? captionLines : [""],
    });
  }

  return entries;
}

function applyTimingFormula(entries) {
  if (entries.length === 0) {
    return { entries: [], caseA: 0, caseB: 0 };
  }

  const result = entries.map((e) => {
    const idealStart = Math.max(0, e.startMs - 100);
    const idealEnd = e.endMs + 300;
    return {
      ...e,
      idealStart,
      idealEnd,
      finalStart: idealStart,
      finalEnd: idealEnd,
    };
  });

  let caseA = 0;
  let caseB = 0;

  for (let i = 0; i < result.length - 1; i += 1) {
    const current = result[i];
    const next = result[i + 1];

    if (next.idealStart < current.endMs) {
      current.finalEnd = current.endMs;
      next.finalStart = current.endMs;
      caseA += 1;
      continue;
    }

    if (next.idealStart > current.endMs && next.idealStart < current.idealEnd) {
      current.finalEnd = next.idealStart;
      next.finalStart = next.idealStart;
      caseB += 1;
    }
  }

  // Bao dam end khong nho hon start trong moi block.
  for (const item of result) {
    if (item.finalEnd < item.finalStart) {
      item.finalEnd = item.finalStart;
    }
  }

  return { entries: result, caseA, caseB };
}

function buildSrt(entries) {
  return entries
    .map((entry, idx) => {
      const index = idx + 1;
      const time = `${msToTimestamp(entry.finalStart)} --> ${msToTimestamp(entry.finalEnd)}`;
      return `${index}\n${time}\n${entry.lines.join("\n")}`;
    })
    .join("\n\n");
}

function renderResults() {
  if (processedResults.length === 0) {
    resultBody.innerHTML = '<tr><td colspan="6" class="empty">Chua co file nao.</td></tr>';
    return;
  }

  resultBody.innerHTML = processedResults
    .map((item, idx) => {
      const statusClass = item.ok ? "status-ok" : "status-error";
      const statusText = item.ok ? "Xong" : `Loi: ${item.error}`;
      const blockCount = item.ok ? item.blockCount : "-";
      const caseA = item.ok ? item.caseA : "-";
      const caseB = item.ok ? item.caseB : "-";
      const downloadCell = item.ok
        ? `<a class="link-btn" href="#" data-download="${idx}">Tai file</a>`
        : "-";

      return `
        <tr>
          <td>${item.name}</td>
          <td class="${statusClass}">${statusText}</td>
          <td>${blockCount}</td>
          <td>${caseA}</td>
          <td>${caseB}</td>
          <td>${downloadCell}</td>
        </tr>
      `;
    })
    .join("");
}

function sanitizeFilename(name) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.cleaned.srt`;
}

function triggerDownload(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function updateActionState() {
  processBtn.disabled = selectedFiles.length === 0;
  downloadAllBtn.disabled = processedResults.length === 0 || processedResults.every((r) => !r.ok);
}

function setFiles(fileList) {
  selectedFiles = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith(".srt")).slice(0, MAX_FILES);
  processedResults = [];
  renderResults();
  updateActionState();

  if (selectedFiles.length === 0) {
    dropZone.querySelector("strong").textContent = "Keo & tha";
    return;
  }

  dropZone.querySelector("strong").textContent = `Da chon ${selectedFiles.length} file`;
}

async function processFiles() {
  processedResults = [];

  for (const file of selectedFiles) {
    try {
      const text = await file.text();
      const entries = parseSrt(text);

      if (entries.length === 0) {
        throw new Error("Khong doc duoc block SRT hop le");
      }

      const applied = applyTimingFormula(entries);
      const output = buildSrt(applied.entries);

      processedResults.push({
        ok: true,
        name: file.name,
        output,
        outputName: sanitizeFilename(file.name),
        blockCount: applied.entries.length,
        caseA: applied.caseA,
        caseB: applied.caseB,
      });
    } catch (err) {
      processedResults.push({
        ok: false,
        name: file.name,
        error: err instanceof Error ? err.message : "Loi khong ro",
      });
    }
  }

  renderResults();
  updateActionState();
}

function downloadAll() {
  const okItems = processedResults.filter((r) => r.ok);
  for (const item of okItems) {
    triggerDownload(item.outputName, item.output);
  }
}

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  setFiles(fileInput.files);
});

["dragenter", "dragover"].forEach((evt) => {
  dropZone.addEventListener(evt, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((evt) => {
  dropZone.addEventListener(evt, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.remove("dragover");
  });
});

dropZone.addEventListener("drop", (event) => {
  const files = event.dataTransfer?.files;
  if (files) {
    setFiles(files);
  }
});

processBtn.addEventListener("click", processFiles);
downloadAllBtn.addEventListener("click", downloadAll);
clearBtn.addEventListener("click", () => {
  selectedFiles = [];
  processedResults = [];
  fileInput.value = "";
  dropZone.querySelector("strong").textContent = "Keo & tha";
  renderResults();
  updateActionState();
});

resultBody.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const idx = target.dataset.download;
  if (typeof idx === "undefined") {
    return;
  }

  event.preventDefault();
  const item = processedResults[Number(idx)];
  if (!item || !item.ok) {
    return;
  }

  triggerDownload(item.outputName, item.output);
});

renderResults();
updateActionState();
