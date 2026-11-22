const editor = document.getElementById("codeEditor");
const gutter = document.getElementById("gutter");
const outputConsole = document.getElementById("outputConsole");
const runBtn = document.getElementById("runBtn");
const clearBtn = document.getElementById("clearBtn");
const themeToggle = document.getElementById("themeToggle");
const crtToggle = document.getElementById("crtToggle");
const crtOverlay = document.getElementById("crtOverlay");
const exampleSelect = document.getElementById("exampleSelect");
const parenStatus = document.getElementById("parenStatus");
const execMeta = document.getElementById("execMeta");
const sandboxStatus = document.getElementById("sandboxStatus");

const EXAMPLES = {
  hello: `;; NULLVECTOR - FIRST CONTACT
(display "HELLO FROM NULLVECTOR!")
(newline)
(display "SCHEME VERSION: ")
(display (get-subsystem-version-string "Release"))
(newline)
`,
  factorial: `;; TAIL-RECURSIVE FACTORIAL (SICP)
(define (fact-iter product counter max-count)
  (if (> counter max-count)
      product
      (fact-iter (* counter product)
                 (+ counter 1)
                 max-count)))

(define (factorial n)
  (fact-iter 1 1 n))

(for-each
  (lambda (n)
    (display n)
    (display "! = ")
    (display (factorial n))
    (newline))
  '(1 5 10 20))
`,
  ycomb: `;; THE Y-COMBINATOR IN MIT/GNU SCHEME
(define Y
  (lambda (f)
    ((lambda (x) (f (lambda (v) ((x x) v))))
     (lambda (x) (f (lambda (v) ((x x) v)))))))

(define fact
  (Y (lambda (self)
       (lambda (n)
         (if (<= n 1) 1 (* n (self (- n 1))))))))

(display "Y-COMBINATOR 12! = ")
(display (fact 12))
(newline)
`,
  sicp_sqrt: `;; SICP SECTION 1.1.7 - NEWTON'S METHOD SQRT
(define (square x) (* x x))
(define (average x y) (/ (+ x y) 2))

(define (sqrt-iter guess x)
  (if (< (abs (- (square guess) x)) 0.00001)
      guess
      (sqrt-iter (average guess (/ x guess)) x)))

(define (my-sqrt x)
  (sqrt-iter 1.0 x))

(display "SQRT(2)  = ") (display (my-sqrt 2)) (newline)
(display "SQRT(42) = ") (display (my-sqrt 42)) (newline)
`,
  church: `;; CHURCH NUMERALS (LAMBDA CALCULUS)
(define zero (lambda (f) (lambda (x) x)))
(define (add-1 n)
  (lambda (f) (lambda (x) (f ((n f) x)))))

(define one (add-1 zero))
(define two (add-1 one))
(define (add m n)
  (lambda (f) (lambda (x) ((m f) ((n f) x)))))

(define (church->int n)
  ((n (lambda (x) (+ x 1))) 0))

(display "CHURCH (2 + 2) = ")
(display (church->int (add two two)))
(newline)
`
};

function updateGutter() {
  const lines = editor.value.split("\n").length;
  let nums = "";
  for (let i = 1; i <= lines; i++) {
    nums += i + (i < lines ? "\n" : "");
  }
  gutter.textContent = nums;
}

function checkParens() {
  const src = editor.value;
  let depth = 0;
  let inString = false;
  let inComment = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inComment) {
      if (ch === "\n") inComment = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === "\"") inString = false;
      continue;
    }
    if (ch === ";") { inComment = true; continue; }
    if (ch === "\"") { inString = true; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth < 0) break;
  }
  if (depth === 0 && !inString) {
    parenStatus.textContent = "PARENS: BALANCED";
    parenStatus.classList.remove("err");
  } else if (inString) {
    parenStatus.textContent = "STRING: UNCLOSED";
    parenStatus.classList.add("err");
  } else {
    parenStatus.textContent = `PARENS: UNBALANCED (${depth > 0 ? "+" + depth : depth})`;
    parenStatus.classList.add("err");
  }
}

async function runCode() {
  const code = editor.value.trim();
  if (!code) return;

  runBtn.disabled = true;
  runBtn.textContent = "[ RUNNING... ]";
  execMeta.textContent = "SPAWNING EPHEMERAL CONTAINER...";
  execMeta.classList.remove("err");
  outputConsole.classList.remove("error");

  try {
    const res = await fetch("/api/eval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Evaluation failed");
    }

    let out = "";
    if (data.stdout) out += data.stdout;
    if (data.stderr) {
      out += (out ? "\n--- STDERR ---\n" : "") + data.stderr;
    }
    if (!out.trim()) {
      out = "; (no output)";
    }

    outputConsole.textContent = out;
    if (data.exit_code !== 0 || data.timed_out) {
      outputConsole.classList.add("error");
      execMeta.classList.add("err");
    }
    execMeta.textContent = `${data.mode.toUpperCase()} | EXIT ${data.exit_code} | ${data.duration_ms}ms | DESTROYED`;
  } catch (err) {
    outputConsole.textContent = `[ERROR] ${err.message}`;
    outputConsole.classList.add("error");
    execMeta.textContent = "EXECUTION ERROR";
    execMeta.classList.add("err");
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "[ EVAL ]";
  }
}

editor.addEventListener("input", () => {
  updateGutter();
  checkParens();
});

editor.addEventListener("scroll", () => {
  gutter.scrollTop = editor.scrollTop;
});

editor.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    runCode();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
    e.preventDefault();
    outputConsole.textContent = "";
    execMeta.textContent = "CLEARED";
  } else if (e.key === "Tab") {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.substring(0, start) + "  " + editor.value.substring(end);
    editor.selectionStart = editor.selectionEnd = start + 2;
    updateGutter();
  }
});

runBtn.addEventListener("click", runCode);
clearBtn.addEventListener("click", () => {
  outputConsole.textContent = "";
  execMeta.textContent = "CLEARED";
});

themeToggle.addEventListener("click", () => {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  themeToggle.textContent = isDark ? "THEME: ARCHIVE" : "THEME: MATRIX";
});

crtToggle.addEventListener("click", () => {
  const hidden = crtOverlay.classList.toggle("hidden");
  crtToggle.textContent = hidden ? "CRT: OFF" : "CRT: ON";
});

exampleSelect.addEventListener("change", () => {
  const key = exampleSelect.value;
  if (key && EXAMPLES[key]) {
    editor.value = EXAMPLES[key];
    updateGutter();
    checkParens();
  }
  exampleSelect.value = "";
});

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    sandboxStatus.textContent = `SANDBOX: ${data.sandbox_mode.toUpperCase()} | TIMEOUT: ${data.timeout_sec}s | IMAGE: ${data.sandbox_image}`;
  } catch {
    sandboxStatus.textContent = "SANDBOX: OFFLINE";
  }
}

updateGutter();
checkParens();
checkHealth();
