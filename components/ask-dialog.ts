// In-page replacements for window.confirm() and window.prompt(), built on a native modal
// <dialog>: styled like the app, they don't freeze the page, and the browser handles focus,
// Esc and the inert page behind them. Plain DOM, so they work from any file (not just components).

/** Shared look of every modal dialog. Tailwind's reset removes the browser's centering margin, hence m-auto. */
export const dialogClass =
  // Manga style: the heavy ink border, red hard shadow and dotted backdrop come from globals.css (dialog:modal).
  "m-auto border-4 border-[var(--ink)] bg-background p-0 text-foreground " +
  // Scrolling over the backdrop or inside the dialog must not scroll the page behind it.
  "overscroll-contain backdrop:overflow-hidden backdrop:overscroll-contain";

const buttonClass = "px-3 py-1.5 text-sm";
const cancelClass = `${buttonClass} border-2 border-zinc-900 font-bold`;
const okClass = `${buttonClass} bg-blue-600 text-white hover:bg-blue-700`;
const dangerClass = `${buttonClass} bg-red-600 text-white hover:bg-red-700`;

/**
 * Click outside to close where the browser doesn't support `closedby="any"` (Safari).
 * Checks the pointer position, not the target: the dialog itself is the target for clicks on
 * its padding. Press and release both have to be outside, so a text-selection drag doesn't close it.
 */
export function lightDismiss(dialog: HTMLDialogElement): () => void {
  if ("closedBy" in HTMLDialogElement.prototype) return () => {};
  const outside = (e: PointerEvent) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedOutside = false;
  const down = (e: PointerEvent) => (pressedOutside = outside(e));
  const up = (e: PointerEvent) => pressedOutside && outside(e) && dialog.close();
  dialog.addEventListener("pointerdown", down);
  dialog.addEventListener("pointerup", up);
  return () => {
    dialog.removeEventListener("pointerdown", down);
    dialog.removeEventListener("pointerup", up);
  };
}

let counter = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Builds the dialog, shows it, and resolves with the button's value ("" for Cancel, Esc or clicking outside). */
function openDialog(build: (form: HTMLFormElement, titleId: string) => { ok: HTMLButtonElement; focus?: HTMLElement; focusCancel?: boolean }, title: string, cancelLabel: string): Promise<string> {
  return new Promise((resolve) => {
    const titleId = `ask-dialog-${++counter}`;
    const dialog = el("dialog", `${dialogClass} w-[min(28rem,calc(100%-2rem))]`);
    dialog.setAttribute("aria-labelledby", titleId);
    dialog.setAttribute("closedby", "closerequest"); // Esc closes it; a stray click outside doesn't.

    const form = el("form", "flex flex-col gap-3 p-5");
    form.method = "dialog";
    const heading = el("h2", "text-lg", title);
    heading.id = titleId;
    form.append(heading);
    const { ok, focus, focusCancel } = build(form, titleId);

    // Cancel is type="button" so Enter in a text field submits OK (the first submit button), not Cancel.
    const cancel = el("button", cancelClass, cancelLabel);
    cancel.type = "button";
    cancel.addEventListener("click", () => dialog.close(""));
    ok.type = "submit";
    ok.value = "ok";
    const row = el("div", "mt-2 flex justify-end gap-2");
    row.append(cancel, ok);
    form.append(row);
    dialog.append(form);

    dialog.addEventListener("close", () => {
      const value = dialog.returnValue;
      dialog.remove();
      resolve(value);
    });
    document.body.append(dialog);
    dialog.returnValue = "";
    dialog.showModal();
    const first = focusCancel ? cancel : (focus ?? ok);
    first.focus();
    if (first instanceof HTMLInputElement) first.select();
  });
}

/**
 * Asks a yes/no question. Resolves true only when the confirm button is clicked.
 * `danger` makes the confirm button red and puts the focus on Cancel, so Enter doesn't delete.
 */
export function askConfirm({
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = false,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  return openDialog(
    (form) => {
      if (message) form.append(el("p", "whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400", message));
      return { ok: el("button", danger ? dangerClass : okClass, confirmLabel), focusCancel: danger };
    },
    title,
    cancelLabel,
  ).then((v) => v === "ok");
}

/** Asks for a line of text. Resolves with the text as typed, or null when cancelled. */
export function askText({
  title,
  label,
  defaultValue = "",
  placeholder = "",
  confirmLabel = "OK",
}: {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  let input!: HTMLInputElement;
  return openDialog(
    (form, titleId) => {
      if (label) form.append(el("p", "text-sm text-zinc-600 dark:text-zinc-400", label));
      input = el("input", "w-full rounded-lg border border-zinc-300 bg-background px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700");
      input.type = "text";
      input.value = defaultValue;
      input.placeholder = placeholder;
      input.spellcheck = false;
      input.setAttribute("aria-labelledby", titleId);
      form.append(input);
      return { ok: el("button", okClass, confirmLabel), focus: input };
    },
    title,
    "Cancel",
  ).then((v) => (v === "ok" ? input.value : null));
}
