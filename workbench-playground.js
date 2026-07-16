const WORKBENCH_ESCAPE_MS = 4000;

window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-workbench-playground]").forEach((playground) => {
    const button = playground.querySelector(".workbench-chase-button");
    const cursor = playground.querySelector(".workbench-cursor");
    if (!button || !cursor) return;

    let firstEnterTime = 0;
    let isReady = false;
    let readyTimer = 0;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const placeElement = (element, x, y) => {
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
    };

    const showCursor = () => {
      cursor.style.opacity = "1";
    };

    const hideCursor = () => {
      cursor.style.opacity = "0";
    };

    const scaleCursor = (isPressed) => {
      cursor.style.transform = `translate(-50%, -50%) scale(${isPressed ? 1.32 : 1})`;
    };

    const getLocalPoint = (event) => {
      const rect = playground.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        width: rect.width,
        height: rect.height
      };
    };

    const getButtonBounds = () => {
      const buttonRect = button.getBoundingClientRect();
      return {
        halfWidth: buttonRect.width / 2,
        halfHeight: buttonRect.height / 2
      };
    };

    const clampButtonPosition = (x, y, width, height) => {
      const bounds = getButtonBounds();
      return {
        x: clamp(x, bounds.halfWidth + 8, width - bounds.halfWidth - 8),
        y: clamp(y, bounds.halfHeight + 8, height - bounds.halfHeight - 8)
      };
    };

    const moveButtonAway = ({ x, y, width, height }) => {
      const preferredX = x < width / 2 ? width - 88 : 88;
      const preferredY = y < height / 2 ? height - 54 : 54;
      const next = clampButtonPosition(preferredX, preferredY, width, height);
      placeElement(button, next.x, next.y);
      button.style.pointerEvents = "none";
    };

    const stickButtonToPointer = ({ x, y, width, height }) => {
      const next = clampButtonPosition(x, y, width, height);
      placeElement(button, next.x, next.y);
      button.style.pointerEvents = "auto";
    };

    const markReady = (point) => {
      isReady = true;
      playground.classList.add("is-ready");
      if (point) stickButtonToPointer(point);
    };

    const activate = (point) => {
      playground.classList.add("is-active");
      placeElement(cursor, point.x, point.y);
      showCursor();

      if (!firstEnterTime) {
        firstEnterTime = performance.now();
        moveButtonAway(point);
        readyTimer = window.setTimeout(() => markReady(point), WORKBENCH_ESCAPE_MS);
      }
    };

    playground.addEventListener("pointerenter", (event) => {
      const point = getLocalPoint(event);
      activate(point);
    });

    playground.addEventListener("pointermove", (event) => {
      const point = getLocalPoint(event);
      activate(point);

      if (isReady || (firstEnterTime && performance.now() - firstEnterTime >= WORKBENCH_ESCAPE_MS)) {
        markReady(point);
        return;
      }

      moveButtonAway(point);
    }, true);

    playground.addEventListener("pointerleave", () => {
      playground.classList.remove("is-active", "is-pressing");
      hideCursor();
      scaleCursor(false);
    });

    playground.addEventListener("pointerdown", () => {
      playground.classList.add("is-pressing");
      scaleCursor(true);
    }, true);

    playground.addEventListener("pointerup", () => {
      playground.classList.remove("is-pressing");
      scaleCursor(false);
    }, true);

    playground.addEventListener("pointercancel", () => {
      playground.classList.remove("is-pressing");
      scaleCursor(false);
    }, true);

    window.addEventListener("pointerup", () => {
      playground.classList.remove("is-pressing");
      scaleCursor(false);
    });

    window.addEventListener("beforeunload", () => {
      if (readyTimer) window.clearTimeout(readyTimer);
    });
  });
});