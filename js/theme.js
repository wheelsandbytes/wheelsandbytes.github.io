// Light/dark toggle. Without JavaScript the site simply follows the OS setting.
// The choice is stored under its own key so it never touches Blagger's "posts".
(function () {
  var button = document.getElementById("theme-toggle");
  if (!button) return;
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function current() {
    return root.dataset.theme || (media.matches ? "dark" : "light");
  }
  function sync() {
    button.setAttribute("aria-pressed", current() === "dark" ? "true" : "false");
  }

  button.hidden = false;
  button.addEventListener("click", function () {
    var next = current() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("wnb-theme", next); } catch (e) {}
    sync();
  });
  media.addEventListener("change", sync);
  sync();
})();
