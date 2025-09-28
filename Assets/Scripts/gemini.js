// @input Asset.InternetModule internetModule
// @input string geminiApiKey

// Gemini API integration for image analysis and obstacle detection

var internetModule = null;
var apiKey = null;

function init(internet, key) {
    internetModule = internet;
    apiKey = key;
    print("[gemini] Initialized with API key: " + (key ? "provided" : "missing"));
}

function readBodyAsString(resp) {
    if (!resp || !resp.body) {
        return "";
    }
    try {
        if (resp.body.readAsString) {
            return resp.body.readAsString();
        }
        if (typeof resp.body === "string") {
            return resp.body;
        }
    } catch (e) {
        print("[gemini] Error reading response body: " + e);
    }
    return "";
}

function analyzeImageForObstacles(imageData, onResult, onError) {
    if (!internetModule) {
        onError && onError("Internet module not initialized");
        return;
    }
    
    if (!apiKey) {
        onError && onError("Gemini API key not configured");
        return;
    }
    
    if (!imageData) {
        onError && onError("No image data provided");
        return;
    }
    
    // Use v1beta API with gemini-1.5-pro (more stable for vision tasks)
    var url = "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=" + apiKey;
    
    var request = RemoteServiceHttpRequest.create();
    request.url = url;
    request.method = RemoteServiceHttpRequest.HttpRequestMethod.Post;
    request.contentType = "application/json";
    
    // Convert image data to base64 if needed
    var base64Image = imageData;
    if (typeof imageData === 'string' && !imageData.startsWith('data:image')) {
        // Assume it's already base64, add data URL prefix
        base64Image = "data:image/jpeg;base64," + imageData;
    }
    
    var payload = {
        contents: [{
            parts: [{
                text: "Analyze this image for navigation safety. Look for:\n1. Obstacles blocking the path (cars, people, construction, debris, etc.)\n2. Crosswalks or pedestrian crossings\n3. Traffic signals or signs\n4. Any other hazards that would affect walking navigation\n\nRespond with a JSON object containing:\n- hasObstacle: boolean (true if there's something blocking the path)\n- obstacleType: string (description of the obstacle, empty if none)\n- hasCrosswalk: boolean (true if there's a crosswalk visible)\n- hasTrafficSignal: boolean (true if there's a traffic signal visible)\n- warningMessage: string (brief warning message for the user, empty if no issues)\n- confidence: number (0-1 confidence level in the analysis)\n\nBe concise and focus on immediate navigation safety."
            }, {
                inlineData: {
                    mimeType: "image/jpeg",
                    data: base64Image.split(',')[1] // Remove data URL prefix
                }
            }]
        }],
        generationConfig: {
            temperature: 0.1,
            topK: 32,
            topP: 1,
            maxOutputTokens: 1024
        }
    };
    
    request.body = JSON.stringify(payload);
    
    print("[gemini] Sending image analysis request...");
    
    internetModule.performHttpRequest(request, function(resp) {
        try {
            var text = readBodyAsString(resp);
            print("[gemini] HTTP status: " + resp.statusCode);
            
            if (resp.statusCode < 200 || resp.statusCode >= 300) {
                onError && onError("HTTP error status: " + resp.statusCode + " - " + text);
                return;
            }
            
            if (!text) {
                onError && onError("Empty response body");
                return;
            }
            
            var json = JSON.parse(text);
            
            if (json.candidates && json.candidates.length > 0) {
                var candidate = json.candidates[0];
                if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                    var responseText = candidate.content.parts[0].text;
                    print("[gemini] Raw response: " + responseText);
                    
                    // Try to parse JSON from the response
                    try {
                        // Extract JSON from the response text
                        var jsonMatch = responseText.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            var analysisResult = JSON.parse(jsonMatch[0]);
                            onResult && onResult(analysisResult);
                        } else {
                            // Fallback: create a basic result from text analysis
                            var hasObstacle = responseText.toLowerCase().includes('obstacle') || 
                                            responseText.toLowerCase().includes('blocking') ||
                                            responseText.toLowerCase().includes('hazard');
                            var hasCrosswalk = responseText.toLowerCase().includes('crosswalk') ||
                                             responseText.toLowerCase().includes('pedestrian crossing');
                            
                            var result = {
                                hasObstacle: hasObstacle,
                                obstacleType: hasObstacle ? "Detected obstacle" : "",
                                hasCrosswalk: hasCrosswalk,
                                hasTrafficSignal: responseText.toLowerCase().includes('traffic signal'),
                                warningMessage: hasObstacle ? "Obstacle detected ahead" : "",
                                confidence: 0.7
                            };
                            onResult && onResult(result);
                        }
                    } catch (parseError) {
                        print("[gemini] JSON parse error: " + parseError);
                        onError && onError("Failed to parse analysis result: " + parseError);
                    }
                } else {
                    onError && onError("No content in response");
                }
            } else {
                onError && onError("No candidates in response");
            }
        } catch (e) {
            print("[gemini] Parse error: " + e);
            onError && onError("Failed to parse response: " + e);
        }
    });
}

module.exports = {
    init: init,
    analyzeImageForObstacles: analyzeImageForObstacles
};