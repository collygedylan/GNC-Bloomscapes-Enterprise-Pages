async function decodeResizedPhotoBitmap(blob, maxWidth = 1280) {
    try {
        return await createImageBitmap(blob, { imageOrientation: 'from-image',
            resizeWidth: maxWidth, resizeQuality: 'medium' });
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        return createImageBitmap(blob, { imageOrientation: 'from-image' });
    }
}
