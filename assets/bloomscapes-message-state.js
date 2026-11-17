const bloomscapesMessagesState={owner:'',farm:'',unread:0,channel:null};

async function refreshBloomscapesMessages() { return refreshBloomscapesComm(); }

function reportBloomscapesMessagesFailure(error) {
    globalThis.reportHandledRuntimeIssue?.('messages',error.code || 'MESSAGES_READ_FAILED');
    showBloomscapesCommStatus(error.message);
}
