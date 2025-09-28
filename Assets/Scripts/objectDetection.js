// Obstacle detection module that coordinates camera capture and Gemini analysis

var camera = require("Scripts/camera.js");
var gemini = require("Scripts/gemini.js");
var voice = require("Scripts/voice.js");

var isMonitoring = false;
var monitoringEvent = null;
var lastWarningTime = 0;
var warningCooldown = 5000; // 5 seconds between warnings
var captureInterval = 5.0; // Take picture every 5 seconds
var scriptContext = null;

function init(cameraTexture, renderTarget, internetModule, geminiApiKey, voiceModule, ttsModule, ttsAudio, ctx) {
    print("[obstacleDetector] Initializing obstacle detection system...");
    
    scriptContext = ctx;
    
    // Initialize camera module
    camera.init(cameraTexture, renderTarget);
    
    // Initialize Gemini module
    gemini.init(internetModule, geminiApiKey);
    
    // Initialize voice module
    voice.init(voiceModule, ttsModule, ttsAudio, scriptContext);
    
    print("[obstacleDetector] Obstacle detection system initialized");
}

function startMonitoring() {
    if (isMonitoring) {
        print("[obstacleDetector] Already monitoring");
        return;
    }
    
    if (!camera.isReady()) {
        print("[obstacleDetector] Camera not ready for monitoring");
        return;
    }
    
    if (!scriptContext) {
        print("[obstacleDetector] Script context not available");
        return;
    }
    
    isMonitoring = true;
    print("[obstacleDetector] Starting obstacle monitoring...");
    
    // Create a delayed callback event for periodic monitoring
    monitoringEvent = scriptContext.createEvent("DelayedCallbackEvent");
    monitoringEvent.bind(function() {
        if (!isMonitoring) {
            return;
        }
        
        captureAndAnalyze();
        
        // Reset the event for the next capture
        monitoringEvent.reset(captureInterval);
    });
    
    // Start the monitoring cycle
    monitoringEvent.reset(captureInterval);
    
    // Also capture immediately
    captureAndAnalyze();
}

function stopMonitoring() {
    if (!isMonitoring) {
        return;
    }
    
    isMonitoring = false;
    if (monitoringEvent) {
        monitoringEvent.enabled = false;
        monitoringEvent = null;
    }
    
    print("[obstacleDetector] Stopped obstacle monitoring");
}

function captureAndAnalyze() {
    if (!isMonitoring) {
        return;
    }
    
    print("[obstacleDetector] Capturing image for analysis...");
    
    camera.captureImage(function(imageData) {
        print("[obstacleDetector] Image captured, sending to Gemini...");
        
        gemini.analyzeImageForObstacles(imageData, function(analysis) {
            print("[obstacleDetector] Analysis result: " + JSON.stringify(analysis));
            handleAnalysisResult(analysis);
        }, function(error) {
            print("[obstacleDetector] Analysis error: " + error);
        });
    }, function(error) {
        print("[obstacleDetector] Capture error: " + error);
    });
}

function handleAnalysisResult(analysis) {
    if (!analysis) {
        return;
    }
    
    var currentTime = Date.now();
    var shouldWarn = false;
    var warningMessage = "";
    
    // Check for obstacles
    if (analysis.hasObstacle && analysis.obstacleType) {
        shouldWarn = true;
        warningMessage = "Warning: " + analysis.obstacleType + " ahead";
    }
    
    // Check for crosswalks
    if (analysis.hasCrosswalk) {
        if (shouldWarn) {
            warningMessage += ". Also, crosswalk detected";
        } else {
            shouldWarn = true;
            warningMessage = "Crosswalk ahead";
        }
    }
    
    // Check for traffic signals
    if (analysis.hasTrafficSignal) {
        if (shouldWarn) {
            warningMessage += ". Traffic signal present";
        } else {
            shouldWarn = true;
            warningMessage = "Traffic signal ahead";
        }
    }
    
    // Use custom warning message if provided
    if (analysis.warningMessage && analysis.warningMessage.trim()) {
        warningMessage = analysis.warningMessage;
        shouldWarn = true;
    }
    
    // Only warn if we have a message and enough time has passed since last warning
    if (shouldWarn && warningMessage.trim() && (currentTime - lastWarningTime) > warningCooldown) {
        print("[obstacleDetector] Issuing warning: " + warningMessage);
        voice.speak(warningMessage);
        lastWarningTime = currentTime;
    }
}

function isMonitoringActive() {
    return isMonitoring;
}

module.exports = {
    init: init,
    startMonitoring: startMonitoring,
    stopMonitoring: stopMonitoring,
    isMonitoringActive: isMonitoringActive
};