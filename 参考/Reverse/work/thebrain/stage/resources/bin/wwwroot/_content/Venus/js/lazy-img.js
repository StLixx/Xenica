var dotNetHelperForLazyImgs = null;

window.observerCallback = (entries, observer) => {
    entries.forEach((entry) => {
        if (!entry.isIntersecting) {
            return;
        }
        window.setTimeout(() => {
          dotNetHelperForLazyImgs.invokeMethodAsync("SetFirstImgSrcForId", entry.target.id);
        }, 50); // wait a split second so we can see it happen
    });
};
window.intersectionObserver = new IntersectionObserver(window.observerCallback, { root: null, threshold: 0.1 });
window.observeElements = (className) => {
    //console.log("className: " + className);
    // delay a little since the elements might not exist and this is an easy way to fix that!
    window.setTimeout(() => {
        document.querySelectorAll("." + className).forEach(function (item) {
            window.intersectionObserver.observe(item);
            //item.style = "background-color: orange";
        });
    }, 250);
};

window.setLazyImgController = (newDotNetHelper) => {
  dotNetHelperForLazyImgs = newDotNetHelper;
};
