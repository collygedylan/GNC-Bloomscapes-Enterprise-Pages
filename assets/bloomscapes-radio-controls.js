/** @returns {string} Navigation container for the communications controls. */
function renderBloomscapesRadioControls() {
    return '<nav data-comm-links aria-label="Communications"></nav>';
}

/** Bind links to the communication views this account can open.
 * @param {Element} container Rendered navigation host.
 * @returns {void}
 */
function mountBloomscapesRadioControls(container) {
    const nav=container.querySelector('[data-comm-links]');
    if (!nav) return;
    nav.replaceChildren();
    for (const [view,label] of [['push-to-talk','Push to Talk'],['messages','Messages']]) {
        if (!canOpenCommunicationView(view)) continue;
        const button=document.createElement('button');
        button.type='button';button.textContent=label;
        button.addEventListener('click',()=>switchView(view));
        nav.append(button);
    }
}
