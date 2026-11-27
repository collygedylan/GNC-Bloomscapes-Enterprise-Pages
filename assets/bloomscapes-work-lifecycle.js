const BLOOMSCAPES_LIFECYCLE_ACTIONS=[
    ['Bunch & Tie','BUNCH_NOTES'],['Bunch Count','BUNCH_NOTES'],['Cover with Poly','BUNCH_NOTES'],
    ['Remove Poly (Spring)','BUNCH_NOTES'],['Spread Block (Spring)','BUNCH_NOTES'],['Spread Count','BUNCH_NOTES'],
    ['Shift Grading','Y_GRADING'],['Haul','HAULING'],['Consolidate','HAULING'],['Haul / Consolidate','HAULING'],['Grade & Haul','Y_GRADING'],['Add to Shear List','SHEARING'],['Can Filling','CAN_FILLING']
];

/** @param {HTMLFormElement} form Current form. @returns {void} Binds the ordered work steps to the creator. */
function bindBloomscapesLifecyclePicker(form) {
    form.querySelector('[data-work-steps]').addEventListener('change',()=>{
        const steps=[...form.querySelectorAll('[name=lifecycleStep]:checked')].map(input=>input.value);
        if (!steps.length) return;
        const kind=BLOOMSCAPES_LIFECYCLE_ACTIONS.find(([action])=>action===steps[0])[1];
        form.elements.workView.value=kind;syncBloomscapesWorkCreatorKind(form);
        form.elements.actionType.value=steps[0];
        form.elements.targetLocation.required=steps.some(step=>['Haul / Consolidate','Grade & Haul'].includes(step));
    });
}

/** @param {HTMLFormElement} form Current form. @param {object} job Job and its completion facts. @returns {void} Restores saved answers to their corresponding rows. */
function restoreBloomscapesMeasuredAnswers(form,job) {
    for (const fieldset of form.querySelectorAll('[data-answer-row]')) {
        const answers=job.completion_answers?.rows?.[fieldset.dataset.answerRow] || {};
        for (const input of fieldset.querySelectorAll('[data-answer-field]')) restoreBloomscapesMeasuredInput(input,answers);
    }
}

function restoreBloomscapesMeasuredInput(input,answers) {
    const value=answers[input.dataset.answerField];
    if (input.type==='checkbox') input.checked=value===true;
    else if (value!==undefined) input.value=value;
    input.disabled=true;
}
