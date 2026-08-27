
window.navigateToElementById = (id) => {
    document.getElementById(id).scrollIntoView();
};

let timer;
window.debounce = (func, timeout = 10) => {
   clearTimeout(timer);
   timer = setTimeout(() => { func.apply(); }, timeout);
}

window.scrollToBottom = (innerId) => {
  var elemInner = document.getElementById(innerId);
  var innerHeight = elemInner.scrollHeight;
  var windowHeight = window.innerHeight;

  window.debounce(() => {
    if (innerHeight > windowHeight) {
      window.scrollBy(0, windowHeight);
    }
  });
};
