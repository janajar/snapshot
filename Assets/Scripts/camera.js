// @input Asset.DeviceCameraTexture deviceCameraTexture
// @input Component.RenderTarget renderTarget

// Camera capture module for taking pictures during navigation

var deviceCameraTexture = null;
var renderTarget = null;
var isCapturing = false;
var scriptContext = null;
var lastCaptureTime = 0;
var captureCooldown = 2000; // 2 seconds between captures

function init(cameraTexture, target, scriptCtx) {
    deviceCameraTexture = cameraTexture;
    renderTarget = target;
    scriptContext = scriptCtx;
    print("[camera] Initialized with camera texture: " + (cameraTexture ? "provided" : "missing"));
}

function captureImage(onSuccess, onError) {
    var currentTime = Date.now();
    
    if (isCapturing) {
        print("[camera] Camera is already capturing, skipping this request");
        onError && onError("Camera is already capturing");
        return;
    }
    
    if (currentTime - lastCaptureTime < captureCooldown) {
        print("[camera] Capture cooldown active, skipping this request");
        onError && onError("Camera capture cooldown active");
        return;
    }
    
    if (!deviceCameraTexture) {
        onError && onError("Device camera texture not available");
        return;
    }
    
    isCapturing = true;
    lastCaptureTime = currentTime;
    print("[camera] Starting image capture...");
    
    // Add a small delay to ensure camera is ready
    var delayEvent = scriptContext.createEvent("DelayedCallbackEvent");
    delayEvent.bind(function() {
        performCapture(onSuccess, onError);
    });
    delayEvent.reset(0.1); // 100ms delay
}

function performCapture(onSuccess, onError) {
    
    try {
        // In Snap AR, DeviceCameraTexture is a Texture asset with copyFrame() method
        // According to StudioLib.d.ts: "Returns a Texture that captures the current state of this Texture Asset."
        print("[camera] Using DeviceCameraTexture.copyFrame() for camera capture...");
        print("[camera] DeviceCameraTexture type: " + typeof deviceCameraTexture);
        
        if (deviceCameraTexture.copyFrame) {
            print("[camera] Calling deviceCameraTexture.copyFrame()...");
            print("[camera] DeviceCameraTexture properties: " + Object.getOwnPropertyNames(deviceCameraTexture).join(", "));
            
            try {
                var capturedTexture = deviceCameraTexture.copyFrame();
                print("[camera] copyFrame() result: " + (capturedTexture ? "success" : "null"));
                
                if (capturedTexture) {
                    print("[camera] Successfully captured frame from camera texture");
                    print("[camera] Captured texture type: " + typeof capturedTexture);
                    convertTextureToBase64(capturedTexture, onSuccess, onError);
                } else {
                    // copyFrame() returned null - alert the user
                    isCapturing = false;
                    print("[camera] copyFrame() returned null - camera capture failed");
                    onError && onError("Camera capture failed: copyFrame() returned null");
                }
            } catch (copyError) {
                isCapturing = false;
                print("[camera] copyFrame() error: " + copyError);
                onError && onError("copyFrame() error: " + copyError);
            }
        } else {
            isCapturing = false;
            onError && onError("DeviceCameraTexture.copyFrame() method not available");
        }
    } catch (e) {
        isCapturing = false;
        print("[camera] Capture error: " + e);
        onError && onError("Camera capture error: " + e);
    }
}

function convertPixelsToBase64(pixels, onSuccess, onError) {
    try {
        if (pixels && pixels.length > 0) {
            // Convert pixel data to base64
            // Note: This is a simplified approach - actual implementation may vary
            // depending on the pixel format (RGBA, RGB, etc.)
            var base64 = btoa(String.fromCharCode.apply(null, pixels));
            isCapturing = false;
            onSuccess && onSuccess(base64);
        } else {
            isCapturing = false;
            onError && onError("No pixel data available");
        }
    } catch (e) {
        isCapturing = false;
        print("[camera] Base64 conversion error: " + e);
        onError && onError("Base64 conversion failed: " + e);
    }
}

function convertTextureToBase64(texture, onSuccess, onError) {
    try {
        if (!texture) {
            onError && onError("No texture provided for conversion");
            return;
        }
        
        print("[camera] Converting texture to base64...");
        print("[camera] Texture type: " + typeof texture);
        print("[camera] Texture methods: " + Object.getOwnPropertyNames(texture).join(", "));
        
        // According to StudioLib.d.ts, getPixels signature is:
        // getPixels(x: number, y: number, width: number, height: number, data: Uint8Array): void
        if (texture.getPixels) {
            print("[camera] Using texture.getPixels()...");
            
            // Get texture dimensions (we'll need to determine these)
            var width = 640;  // Default width
            var height = 480; // Default height
            
            // Create Uint8Array for pixel data
            var pixelData = new Uint8Array(width * height * 4); // RGBA format
            
            // Call getPixels with the correct signature
            texture.getPixels(0, 0, width, height, pixelData);
            
            if (pixelData && pixelData.length > 0) {
                print("[camera] Got pixel data, converting to base64...");
                // Convert Uint8Array to base64
                var base64 = btoa(String.fromCharCode.apply(null, pixelData));
                onSuccess && onSuccess(base64);
            } else {
                onError && onError("No pixel data returned from getPixels");
            }
        } else if (texture.toBase64) {
            print("[camera] Using texture.toBase64()...");
            var base64 = texture.toBase64();
            onSuccess && onSuccess(base64);
        } else {
            onError && onError("No valid texture conversion method available. Available methods: " + 
                Object.getOwnPropertyNames(texture).join(", "));
        }
    } catch (e) {
        print("[camera] Base64 conversion error: " + e);
        onError && onError("Base64 conversion failed: " + e);
    }
}

function isReady() {
    return deviceCameraTexture !== null && !isCapturing;
}

module.exports = {
    init: init,
    captureImage: captureImage,
    isReady: isReady
};