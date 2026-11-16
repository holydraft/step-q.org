window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-workbench-playground]").forEach((playground) => {
    const mockup = playground.closest(".mockup");
    if (!mockup) return;

    const updateFlowState = () => {
      const isActive = playground.matches(":hover") || playground.contains(document.activeElement);
      mockup.classList.toggle("is-flowing", isActive);
    };

    playground.addEventListener("pointerenter", updateFlowState);
    playground.addEventListener("pointerleave", updateFlowState);
    playground.addEventListener("focusin", updateFlowState);
    playground.addEventListener("focusout", () => {
      window.requestAnimationFrame(updateFlowState);
    });
  });
});