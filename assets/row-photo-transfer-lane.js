const detailPhotoTransfers = [];
const DETAIL_PHOTO_TRANSFER_LIMIT = 3;
let activeDetailPhotoTransfers = 0;

function runDetailPhotoTransfer(operation) {
    return new Promise((resolve,reject) => {
        detailPhotoTransfers.push({operation,resolve,reject});
        drainDetailPhotoTransfers();
    });
}

function drainDetailPhotoTransfers() {
    while (activeDetailPhotoTransfers < DETAIL_PHOTO_TRANSFER_LIMIT && detailPhotoTransfers.length) {
        const task = detailPhotoTransfers.shift();
        activeDetailPhotoTransfers += 1;
        Promise.resolve().then(task.operation).then(task.resolve,task.reject).finally(() => {
            activeDetailPhotoTransfers -= 1;
            drainDetailPhotoTransfers();
        });
    }
}
