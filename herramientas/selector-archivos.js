/* Selector de archivos en español. El <input type=file> nativo escribe su botón y su estado en el idioma del
   NAVEGADOR («选择文件», «Choose files»…); aquí el input queda oculto a la vista pero accesible y enfocable, un <label>
   hace de botón y esta línea propia dice cuántos archivos hay. Sin este script el label sigue abriendo el selector. */
(function (raiz) {
  'use strict';
  function texto(n) {
    return n === 0 ? 'Ningún archivo seleccionado' : (n === 1 ? '1 archivo seleccionado' : n + ' archivos seleccionados');
  }
  function indicar(input, n) {
    var est = input && input.id ? document.getElementById(input.id + '-estado') : null;
    if (est) est.textContent = texto(n);
  }
  function iniciar() {
    var todos = document.querySelectorAll('input[type=file].oculto-accesible');
    for (var i = 0; i < todos.length; i++) {
      (function (inp) {
        indicar(inp, inp.files ? inp.files.length : 0);
        inp.addEventListener('change', function () { indicar(inp, inp.files ? inp.files.length : 0); });
      })(todos[i]);
    }
  }
  raiz.TCSelector = { indicar: indicar, texto: texto };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window);
