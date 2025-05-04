document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const uploadArea = document.getElementById('uploadArea');
    const browseButton = document.getElementById('browseButton');
    const fileInput = document.getElementById('fileInput');
    const editor = document.getElementById('editor');
    const originalPreview = document.getElementById('originalPreview');
    const canvas = document.getElementById('canvas');
    // Get context with willReadFrequently hint for potential performance optimization
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const brightnessSlider = document.getElementById('brightness');
    const contrastSlider = document.getElementById('contrast');
    const saturationSlider = document.getElementById('saturation');
    const sharpnessSlider = document.getElementById('sharpness');
    const resetButton = document.getElementById('resetButton');
    const loadNewButton = document.getElementById('loadNewButton'); // Get the new button

    const brightnessValue = document.getElementById('brightnessValue');
    const contrastValue = document.getElementById('contrastValue');
    const saturationValue = document.getElementById('saturationValue');
    const sharpnessValue = document.getElementById('sharpnessValue');

    const formatSelect = document.getElementById('formatSelect');
    const qualityLabel = document.getElementById('qualityLabel');
    const qualityRange = document.getElementById('qualityRange');
    const qualityValue = document.getElementById('qualityValue');
    const downloadButton = document.getElementById('downloadButton');
    const statusMessage = document.getElementById('status');

    // --- State ---
    let originalImage = null; // Stores the loaded Image object
    let originalImageDataForSharpness = null; // Stores initial pixel data ONLY for sharpness base if needed
    let currentFile = null; // Stores the file object for naming download

    const defaultValues = {
        brightness: 100,
        contrast: 100,
        saturation: 100,
        sharpness: 0,
    };

    // Debounce function to limit frequent calls (e.g., slider input)
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Debounced version of applyEnhancements for slider inputs
    const debouncedApplyEnhancements = debounce(applyEnhancements, 50); // Adjust wait time (ms) as needed


    // --- Functions ---

    // Function to handle file loading (from any source)
    function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            setStatus('Please select a valid image file.', true);
            return;
        }
        currentFile = file;
        const reader = new FileReader();

        reader.onload = function(e) {
            originalImage = new Image();
            // --- Tainted Canvas Handling ---
            // If loading images from external URLs directly (not via file input/paste),
            // you *might* need to set crossOrigin. This is generally NOT needed for
            // File/Blob objects from input/paste as they are considered same-origin.
            // originalImage.crossOrigin = "Anonymous"; // Use if loading external URLs

            originalImage.onload = function() {
                setStatus('Image loaded. Adjust settings below.', false);
                editor.style.display = 'flex';
                uploadArea.style.display = 'none';

                originalPreview.src = e.target.result; // Show original preview using the data URL

                // --- Sharpness Capability Check ---
                let canGetImageData = true;
                let tempCanvas = null;
                let tempCtx = null;
                try {
                    tempCanvas = document.createElement('canvas');
                    // Use lowPowerPreference if available and relevant? Usually not needed here.
                    tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true }); // Use hint here too
                    tempCanvas.width = 1;
                    tempCanvas.height = 1;
                    tempCtx.drawImage(originalImage, 0, 0, 1, 1);
                    tempCtx.getImageData(0, 0, 1, 1);
                    console.log("getImageData pre-check successful.");
                } catch (error) {
                    if (error.name === 'SecurityError') {
                        console.error("SecurityError: Cannot get ImageData from a tainted canvas. Sharpness will be disabled.", error);
                        setStatus("Warning: Cannot apply sharpness due to browser security restrictions (likely cross-origin image). Try downloading and re-uploading.", false);
                    } else {
                        console.error("Error during getImageData pre-check:", error);
                        setStatus("Error processing image data. Sharpness may be unavailable.", true);
                    }
                    canGetImageData = false;
                }
                tempCanvas = null; // Allow garbage collection
                tempCtx = null;
                // --- End Sharpness Check ---


                // Set main canvas size to image size
                canvas.width = originalImage.naturalWidth;
                canvas.height = originalImage.naturalHeight;

                // Draw the initial image onto the main canvas
                ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

                // Store initial pixel data ONLY if possible (for sharpness calculations)
                originalImageDataForSharpness = null;
                sharpnessSlider.disabled = true; // Default to disabled

                if (canGetImageData) {
                    try {
                        originalImageDataForSharpness = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        sharpnessSlider.disabled = false;
                        console.log("Successfully stored initial image data for sharpness.");
                    } catch (error) {
                        console.error("Could not get ImageData from main canvas after drawing (unexpected):", error);
                        setStatus("Error getting image data after drawing. Sharpness disabled.", true);
                    }
                } else {
                     console.warn("Sharpness remains disabled due to failed pre-check or error.");
                }


                resetAdjustments(); // Apply default/reset filters (which calls applyEnhancements)
            }
            originalImage.onerror = function() {
                setStatus('Error loading image file data.', true);
                startOver(); // Go back to upload screen on load error
            }
            originalImage.src = e.target.result; // Start loading the image data into the Image object
        }
        reader.onerror = function() {
             setStatus('Error reading file.', true);
        }
        reader.readAsDataURL(file); // Read file as Data URL
        setStatus('Loading image...', false);
    }

    // Function to apply filters and sharpness
    function applyEnhancements() {
        if (!originalImage || canvas.width === 0 || canvas.height === 0) {
             // console.log("applyEnhancements skipped: No image or canvas size is zero.");
             return;
        }
        // console.time("applyEnhancements"); // Optional: time the execution

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const brightness = brightnessSlider.value;
        const contrast = contrastSlider.value;
        const saturation = saturationSlider.value;
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;

        ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

        ctx.filter = 'none';

        const sharpness = parseInt(sharpnessSlider.value, 10);
        if (sharpness > 0 && !sharpnessSlider.disabled && originalImageDataForSharpness) {
            try {
                // console.time("getImageDataForSharpness");
                const currentFilteredImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                // console.timeEnd("getImageDataForSharpness");

                // console.time("applyConvolution");
                applyConvolution(getSharpenKernel(sharpness / 100), currentFilteredImageData);
                // console.timeEnd("applyConvolution");
            } catch(error) {
                console.error("Error getting/processing image data during sharpness application:", error);
                setStatus("Error applying sharpness. Disabling for this image.", true);
                sharpnessSlider.disabled = true;
                 // Restore the view *before* sharpness was attempted
                 ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
                 ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
                 ctx.filter = 'none';
            }
        } else if (sharpness > 0 && sharpnessSlider.disabled) {
            // console.warn("Sharpness skipped: Slider is disabled.");
        }

        brightnessValue.textContent = `${brightness}%`;
        contrastValue.textContent = `${contrast}%`;
        saturationValue.textContent = `${saturation}%`;
        sharpnessValue.textContent = `${sharpness}%`;

        // console.timeEnd("applyEnhancements");
    }

    // Function to reset sliders to defaults and re-apply enhancements
    function resetAdjustments() {
        brightnessSlider.value = defaultValues.brightness;
        contrastSlider.value = defaultValues.contrast;
        saturationSlider.value = defaultValues.saturation;
        sharpnessSlider.value = defaultValues.sharpness;

        sharpnessSlider.disabled = !originalImageDataForSharpness;

        applyEnhancements(); // Redraw the canvas with default filter values (no need to debounce reset)
    }

    // --- Convolution Filter for Sharpness ---
    function getSharpenKernel(amount) {
        const intensity = amount * 4;
        return [
            [0,       -amount,         0],
            [-amount, 1 + intensity, -amount],
            [0,       -amount,         0]
        ];
    }

    function applyConvolution(kernel, sourceImageData) {
        if (!sourceImageData) {
             console.error("Cannot apply convolution: sourceImageData is null.");
             return;
        }

        const srcData = sourceImageData.data;
        const width = sourceImageData.width;
        const height = sourceImageData.height;
        const dstImageData = ctx.createImageData(width, height);
        const dstData = dstImageData.data;

        const kernelSize = 3;
        const halfKernel = 1;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const dstOff = (y * width + x) * 4;
                let r = 0, g = 0, b = 0;

                for (let ky = 0; ky < kernelSize; ky++) {
                    for (let kx = 0; kx < kernelSize; kx++) {
                        const K = kernel[ky][kx];
                        if (K === 0) continue;

                        let srcX = x + kx - halfKernel;
                        let srcY = y + ky - halfKernel;

                        srcX = Math.max(0, Math.min(width - 1, srcX));
                        srcY = Math.max(0, Math.min(height - 1, srcY));

                        const srcOff = (srcY * width + srcX) * 4;

                        r += srcData[srcOff] * K;
                        g += srcData[srcOff + 1] * K;
                        b += srcData[srcOff + 2] * K;
                    }
                }

                dstData[dstOff] = r;
                dstData[dstOff + 1] = g;
                dstData[dstOff + 2] = b;
                dstData[dstOff + 3] = srcData[dstOff + 3]; // Preserve alpha
            }
        }
        ctx.putImageData(dstImageData, 0, 0);
    }


    // --- Function: Start Over / Load New Image ---
    function startOver() {
        console.log("Starting over / Resetting UI.");
        editor.style.display = 'none';
        uploadArea.style.display = 'block';

        originalPreview.src = '#';
        originalPreview.alt = "Original Image Preview";
        if (canvas.width > 0 || canvas.height > 0) {
             ctx.setTransform(1, 0, 0, 1, 0, 0);
             ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        // Reset canvas dimensions to 0 to ensure no old image flashes on reload?
        // canvas.width = 0;
        // canvas.height = 0;

        originalImage = null;
        originalImageDataForSharpness = null;
        currentFile = null;
        if (fileInput) {
            try {
                 fileInput.value = null;
            } catch (ex) {
                 console.warn("Could not reset file input value: ", ex);
            }
        }

        brightnessSlider.value = defaultValues.brightness;
        contrastSlider.value = defaultValues.contrast;
        saturationSlider.value = defaultValues.saturation;
        sharpnessSlider.value = defaultValues.sharpness;
        sharpnessSlider.disabled = true; // Always disable initially

        brightnessValue.textContent = `${defaultValues.brightness}%`;
        contrastValue.textContent = `${defaultValues.contrast}%`;
        saturationValue.textContent = `${defaultValues.saturation}%`;
        sharpnessValue.textContent = `${defaultValues.sharpness}%`;

        formatSelect.value = 'image/png';
        formatSelect.dispatchEvent(new Event('change')); // Update quality slider visibility

        setStatus('Load an image using one of the methods above.');
    }


    // --- Event Listeners ---

    browseButton.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
             handleFile(files[0]);
        }
    });
    uploadArea.addEventListener('click', (e) => {
        if (e.target === uploadArea || e.target.tagName === 'P') {
             fileInput.click();
        }
    });

    document.addEventListener('paste', (e) => {
        const items = (e.clipboardData || window.clipboardData)?.items;
        if (!items) return;
        let foundImage = false;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    const fileExtension = blob.type.split('/')[1] || 'png';
                    const fileName = `pasted-image-${Date.now()}.${fileExtension}`;
                    const file = new File([blob], fileName, { type: blob.type });
                    handleFile(file);
                    foundImage = true;
                    e.preventDefault();
                    break;
                }
            }
        }
    });

    // --- Adjustment Sliders --- Use debounced handler
    brightnessSlider.addEventListener('input', debouncedApplyEnhancements);
    contrastSlider.addEventListener('input', debouncedApplyEnhancements);
    saturationSlider.addEventListener('input', debouncedApplyEnhancements);
    sharpnessSlider.addEventListener('input', debouncedApplyEnhancements);

    // Reset Button Click - no debounce needed
    resetButton.addEventListener('click', resetAdjustments);

    // Load New Image Button Click - no debounce needed
    loadNewButton.addEventListener('click', startOver);

    // Format Selection Change
    formatSelect.addEventListener('change', () => {
        const isJpegOrWebp = formatSelect.value === 'image/jpeg' || formatSelect.value === 'image/webp';
        const displayStyle = isJpegOrWebp ? 'inline-block' : 'none';

        qualityLabel.style.display = isJpegOrWebp ? 'inline' : 'none';
        qualityRange.style.display = displayStyle;
        qualityValue.style.display = isJpegOrWebp ? 'inline' : 'none';
    });

    // Quality Range Input
    qualityRange.addEventListener('input', () => {
        qualityValue.textContent = parseFloat(qualityRange.value).toFixed(1);
    });

    // Download Button Click
    downloadButton.addEventListener('click', () => {
        if (!originalImage || canvas.width === 0 || canvas.height === 0) {
             setStatus("No image loaded or processed to download.", true);
             return;
        }

        const format = formatSelect.value;
        const quality = (format === 'image/jpeg' || format === 'image/webp')
                         ? parseFloat(qualityRange.value)
                         : undefined;

        const baseFilename = currentFile ? currentFile.name : 'enhanced-image';
        const newExtension = format.split('/')[1] || 'png';
        const filename = generateFilename(baseFilename, newExtension);

        setStatus('Generating download...', false);

        try {
            canvas.toBlob((blob) => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    setStatus(`Image downloaded as ${filename}`, false);
                } else {
                     console.error('canvas.toBlob callback received null blob.');
                     setStatus('Error creating image blob for download. Canvas might be too large or contain errors.', true);
                }
            }, format, quality);
        } catch (error) {
             console.error("Error during canvas.toBlob() call:", error);
             setStatus("Error initiating download process.", true);
        }
    });

    // Helper function to generate a download filename
    function generateFilename(originalName, newExtension) {
        const nameWithoutExtension = originalName.includes('.')
                                    ? originalName.substring(0, originalName.lastIndexOf('.'))
                                    : originalName;
        return `${nameWithoutExtension}-enhanced.${newExtension}`;
    }

    // Helper function to set status messages
    function setStatus(message, isError = false) {
        statusMessage.textContent = message;
        statusMessage.style.color = isError ? '#dc3545' : '#28a745'; // Red for error, Green for success/info
    }

    // --- Initial Setup ---
    startOver(); // Call startOver on page load

}); // End DOMContentLoaded