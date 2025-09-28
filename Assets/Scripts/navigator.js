// Navigator wrapper for Spectacles Navigation Kit

var nav = null;

function init(navigationComponent) {
    nav = navigationComponent;
}

function getPlaces() {
    if (!nav) { return []; }
    // Support either direct property or api wrapper
    var list = nav.places || (nav.api && nav.api.places) || [];
    return list || [];
}

function navigateToPlace(place) {
    if (!nav || !place) { return; }
    var fn = nav.navigateToPlace || (nav.api && nav.api.navigateToPlace);
    if (fn) { fn.call(nav.api ? nav.api : nav, place); }
}

function stopNavigation() {
    if (!nav) { return; }
    var fn = nav.stopNavigation || (nav.api && nav.api.stopNavigation);
    if (fn) { fn.call(nav.api ? nav.api : nav); }
}

function addEvent(eventName, cb) {
    if (!nav || !cb) { return; }
    var evt = nav[eventName] || (nav.api && nav.api[eventName]);
    if (evt && evt.add) { evt.add(cb); }
}

module.exports = {
    init: init,
    getPlaces: getPlaces,
    navigateToPlace: navigateToPlace,
    stopNavigation: stopNavigation,
    addEvent: addEvent
};