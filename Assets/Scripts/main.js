// @input Asset.InternetModule internetModule
// @input Asset.VoiceMLModule voiceML
// @input Asset.TextToSpeechModule tts
// @input string googleApiKey
// @input Component.AudioComponent ttsAudio
// @input bool useOverrideLocation = false
// @input string geminiApiKey

var voice = require("Scripts/voice.js");

// Initialize voice with TTS audio component
print("[main] Initializing voice system...");
voice.init(script.voiceML, script.tts, script.ttsAudio, script);
print("[main] Voice system initialized");

var currentLocation = null;
var currentRoute = null;
var currentStepIndex = 0;
var isNavigating = false;
var locationService = null;
var currentHeadingDegrees = null;

// Location tracking
function initLocationTracking() {
    try {
        locationService = GeoLocation.createLocationService();
        locationService.accuracy = GeoLocationAccuracy.Navigation;

        if (locationService.onNorthAlignedOrientationUpdate) {
            locationService.onNorthAlignedOrientationUpdate.add(function(northAlignedOrientation) {
                try {
                    currentHeadingDegrees = GeoLocation.getNorthAlignedHeading(northAlignedOrientation);
                } catch (headingErr) {
                    print("[location] Heading calculation error: " + headingErr);
                }
            });
        }
        
        // Poll for location updates
        script.createEvent("UpdateEvent").bind(function() {
            if (!locationService) return;
            
            locationService.getCurrentPosition(function(pos) {
                currentLocation = pos;
                applyLocationOverride();
                checkNavigationProgress();
            }, function(err) {
                print("[location] Error: " + err);
                if (!currentLocation) {
                    applyLocationOverride(true);
                }
            });
        });
        
        print("[main] Location tracking initialized");
    } catch (e) {
        print("[main] Location error: " + e);
        applyLocationOverride(true);
    }
}

function applyLocationOverride(force) {
    if (!(script.useOverrideLocation || force)) {
        return;
    }
    var lat = 42.2936; // Duderstadt Center latitude
    var lon = -83.7116; // Duderstadt Center longitude
    if (!currentLocation) {
        currentLocation = {
            latitude: lat,
            longitude: lon,
            horizontalAccuracy: 0,
            locationSource: "override"
        };
    } else {
        currentLocation.latitude = lat;
        currentLocation.longitude = lon;
        currentLocation.locationSource = "override";
    }
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
        print("[main] Error reading response body: " + e);
    }
    return "";
}

// Google Places API search
function searchNearbyPlace(query, onDone, onError) {
    if (!currentLocation) {
        onError && onError("No location available");
        return;
    }
    
    if (!script.googleApiKey) {
        onError && onError("Google API key not configured");
        return;
    }
    
    var lat = currentLocation.latitude;
    var lon = currentLocation.longitude;
    var url = "https://places.googleapis.com/v1/places:searchText";
    
    var request = RemoteServiceHttpRequest.create();
    request.url = url;
    request.method = RemoteServiceHttpRequest.HttpRequestMethod.Post;
    request.contentType = "application/json";
    request.body = JSON.stringify({
        textQuery: query,
        locationBias: {
            circle: {
                center: {
                    latitude: lat,
                    longitude: lon
                },
                radius: 5000
            }
        }
    });
    request.setHeader("X-Goog-Api-Key", script.googleApiKey);
    request.setHeader("X-Goog-FieldMask", "places.displayName,places.formattedAddress,places.location");
    
    script.internetModule.performHttpRequest(request, function(resp) {
        try {
            var text = readBodyAsString(resp);
            print("[main] Places HTTP status: " + resp.statusCode);
            if (text && text.length > 0) {
                var logText = text.length > 300 ? text.substring(0, 300) + "..." : text;
                print("[main] Places HTTP body: " + logText);
            } else {
                print("[main] Places HTTP body empty");
            }
            if (resp.statusCode < 200 || resp.statusCode >= 300) {
                onError && onError("HTTP error status: " + resp.statusCode);
                return;
            }
            if (!text) {
                onError && onError("Empty response body");
                return;
            }
            var json = JSON.parse(text);
            
            if (json.places && json.places.length > 0) {
                var nearest = json.places[0];
                var place = {
                    name: nearest.displayName ? nearest.displayName.text : "Unknown",
                    address: nearest.formattedAddress || "",
                    lat: nearest.location ? nearest.location.latitude : 0,
                    lon: nearest.location ? nearest.location.longitude : 0,
                    distance: calculateDistance(lat, lon,
                        nearest.location ? nearest.location.latitude : lat,
                        nearest.location ? nearest.location.longitude : lon)
                };
                onDone && onDone(place);
            } else {
                onError && onError("No places found");
            }
        } catch (e) {
            print("[places] Parse error: " + e);
            onError && onError("Failed to parse results: " + e);
        }
    });
}

// Google Directions API
function getDirections(destination, onDone, onError) {
    if (!currentLocation) {
        onError && onError("No current location");
        return;
    }
    
    if (!script.googleApiKey) {
        onError && onError("Google API key not configured");
        return;
    }
    
    var originLat = currentLocation.latitude;
    var originLon = currentLocation.longitude;
    var destLat = destination.lat;
    var destLon = destination.lon;
    var url = "https://routes.googleapis.com/directions/v2:computeRoutes";
    
    var payload = {
        origin: {
            location: {
                latLng: {
                    latitude: originLat,
                    longitude: originLon
                }
            }
        },
        destination: {
            location: {
                latLng: {
                    latitude: destLat,
                    longitude: destLon
                }
            }
        },
        travelMode: "WALK",
        routingPreference: "ROUTING_PREFERENCE_UNSPECIFIED",
        polylineQuality: "OVERVIEW",
        computeAlternativeRoutes: false,
        languageCode: "en-US",
        units: "IMPERIAL"
    };
    
    var request = RemoteServiceHttpRequest.create();
    request.url = url;
    request.method = RemoteServiceHttpRequest.HttpRequestMethod.Post;
    request.contentType = "application/json";
    request.body = JSON.stringify(payload);
    request.setHeader("X-Goog-Api-Key", script.googleApiKey);
    request.setHeader("X-Goog-FieldMask", "routes");
    
    print("[main] Requesting directions via Routes API v2 POST payload: " + request.body);
    
    script.internetModule.performHttpRequest(request, function(resp) {
        try {
            var text = readBodyAsString(resp);
            print("[main] Directions HTTP status: " + resp.statusCode);
            if (text && text.length > 0) {
                var logText = text.length > 300 ? text.substring(0, 300) + "..." : text;
                print("[main] Directions HTTP body: " + logText);
            } else {
                print("[main] Directions HTTP body empty");
            }
            if (resp.statusCode < 200 || resp.statusCode >= 300) {
                onError && onError("HTTP error status: " + resp.statusCode);
                return;
            }
            if (!text) {
                onError && onError("Empty response body");
                return;
            }
            var json = JSON.parse(text);
            
            var routes = json.routes || [];
            if (!routes.length) {
                onError && onError("No route found");
                return;
            }
            var route = routes[0];
            var steps = [];
            var legs = route.legs || [];
            if (legs.length > 0) {
                var leg = legs[0];
                var stepList = leg.steps || [];
                for (var i = 0; i < stepList.length; i++) {
                    var step = stepList[i];
                    var instruction = (step.navigationInstruction && step.navigationInstruction.instructions) || "Continue";
                    var distanceMeters = step.distanceMeters || 0;
                    var durationSeconds = parseGoogleDurationSeconds(step.duration);
                    var endLat = null;
                    var endLon = null;
                    if (step.endLocation && step.endLocation.latLng) {
                        endLat = step.endLocation.latLng.latitude;
                        endLon = step.endLocation.latLng.longitude;
                    }
                    steps.push({
                        instruction: instruction,
                        distanceText: step.distanceText || "",
                        distanceMeters: distanceMeters,
                        durationSeconds: durationSeconds,
                        endLat: endLat,
                        endLon: endLon
                    });
                }
            }
            
            var totalDistanceMeters = route.distanceMeters || (legs.length > 0 && legs[0].distanceMeters) || 0;
            var totalDurationSeconds = parseGoogleDurationSeconds(route.duration || (legs.length > 0 && legs[0].duration));
            
            onDone && onDone({
                steps: steps,
                totalDistance: formatImperialDistance(totalDistanceMeters),
                totalDistanceMeters: totalDistanceMeters,
                totalDuration: formatDurationSeconds(totalDurationSeconds),
                totalDurationSeconds: totalDurationSeconds
            });
        } catch (e) {
            print("[directions] Parse error: " + e);
            onError && onError("Failed to parse directions: " + e);
        }
    });
}

// Utility functions
function calculateDistance(lat1, lon1, lat2, lon2) {
    var R = 6371; // Earth's radius in km
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
}

function stripHtml(html) {
    return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
}

function formatPlaceDistance(distanceKm) {
    var meters = distanceKm * 1000;
    return formatImperialDistance(meters);
}

function buildStepSpeech(instruction, distanceText, distanceMeters) {
    var prefix = distanceText;
    if (!prefix) {
        prefix = formatImperialDistance(distanceMeters);
    }
    if (prefix) {
        return "In " + prefix + ", " + instruction;
    }
    return instruction;
}

function formatImperialDistance(distanceMeters) {
    if (!distanceMeters || distanceMeters <= 0) {
        return "";
    }
    var feet = distanceMeters * 3.28084;
    if (feet < 100) {
        return Math.round(feet) + " feet";
    }
    if (feet < 1000) {
        return Math.round(feet / 10) * 10 + " feet";
    }
    var miles = feet / 5280.0;
    if (miles < 10) {
        return miles.toFixed(1) + " miles";
    }
    return Math.round(miles) + " miles";
}

function normalizeRelativeAngle(angle) {
    if (!isFinite(angle)) {
        return 0;
    }
    var normalized = angle % 360;
    if (normalized > 180) {
        normalized -= 360;
    } else if (normalized < -180) {
        normalized += 360;
    }
    return normalized;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
    if (lat1 === lat2 && lon1 === lon2) {
        return null;
    }
    var phi1 = lat1 * Math.PI / 180;
    var phi2 = lat2 * Math.PI / 180;
    var deltaLambda = (lon2 - lon1) * Math.PI / 180;
    var y = Math.sin(deltaLambda) * Math.cos(phi2);
    var x = Math.cos(phi1) * Math.cos(phi2) - Math.sin(phi1) * Math.sin(phi2) * Math.cos(deltaLambda);
    if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) {
        return null;
    }
    var theta = Math.atan2(y, x);
    var bearing = (theta * 180 / Math.PI + 360) % 360;
    return bearing;
}

function getRelativeTurnPhrase(angle) {
    var absAngle = Math.abs(angle);
    if (absAngle <= 20) {
        return "continue straight ahead";
    }
    if (absAngle >= 160) {
        return "turn around";
    }
    if (angle > 0) {
        if (absAngle <= 60) {
            return "turn slightly right";
        }
        if (absAngle <= 120) {
            return "turn right";
        }
        return "turn sharply right";
    }
    if (absAngle <= 60) {
        return "turn slightly left";
    }
    if (absAngle <= 120) {
        return "turn left";
    }
    return "turn sharply left";
}

function removeCardinalDirections(text) {
    if (!text) {
        return "";
    }
    var cleaned = text.replace(/\b(Head|Turn|Continue|Go|Walk|Keep)\s+(?:north|south|east|west|northeast|northwest|southeast|southwest)\b/gi, "$1");
    cleaned = cleaned.replace(/\b(north|south|east|west|northeast|northwest|southeast|southwest)\b/gi, "");
    cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
    cleaned = cleaned.replace(/\b(Head|head)\s+on\b/g, "Head");
    cleaned = cleaned.replace(/\b(go|Go)\s+on\b/g, "$1");
    return cleaned;
}

function buildRelativeStepSpeech(step) {
    if (!step) {
        return "";
    }

    var relativeInstruction = null;
    if (currentLocation && currentHeadingDegrees !== null && step.endLat !== null && step.endLon !== null) {
        var bearing = calculateBearing(currentLocation.latitude, currentLocation.longitude, step.endLat, step.endLon);
        if (bearing !== null && !isNaN(bearing)) {
            var relativeAngle = normalizeRelativeAngle(bearing - currentHeadingDegrees);
            var turnPhrase = getRelativeTurnPhrase(relativeAngle);
            if (turnPhrase) {
                var distanceString = step.distanceText;
                if (!distanceString) {
                    distanceString = formatImperialDistance(step.distanceMeters);
                }
                var prefix = distanceString ? "In " + distanceString + ", " : "";
                relativeInstruction = prefix + turnPhrase;
            }
        }
    }

    if (!relativeInstruction) {
        return buildStepSpeech(step.instruction, step.distanceText, step.distanceMeters);
    }

    var cleanedInstruction = removeCardinalDirections(step.instruction);
    if (cleanedInstruction && cleanedInstruction.toLowerCase() !== "continue") {
        return relativeInstruction + ". " + cleanedInstruction;
    }
    return relativeInstruction;
}

function parseGoogleDurationSeconds(duration) {
    if (!duration) return 0;
    if (typeof duration === 'string') {
        // Handle common formats like "1h 30m", "1h30m", "1h", "30m"
        var parts = duration.match(/(\d+)([hms])/g);
        var totalSeconds = 0;
        if (parts) {
            for (var i = 0; i < parts.length; i++) {
                var match = parts[i].match(/(\d+)([hms])/);
                if (match) {
                    var value = parseInt(match[1], 10);
                    var unit = match[2];
                    switch (unit) {
                        case 'h': totalSeconds += value * 3600; break;
                        case 'm': totalSeconds += value * 60; break;
                        case 's': totalSeconds += value; break;
                    }
                }
            }
        }
        return totalSeconds;
    } else if (typeof duration === 'object' && duration.seconds) {
        return duration.seconds;
    }
    return 0;
}

function formatDurationSeconds(seconds) {
    if (seconds === 0) return "0 seconds";
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var remainingSeconds = seconds % 60;

    var parts = [];
    if (hours > 0) parts.push(hours + " hour" + (hours > 1 ? "s" : ""));
    if (minutes > 0) parts.push(minutes + " minute" + (minutes > 1 ? "s" : ""));
    if (remainingSeconds > 0) parts.push(remainingSeconds + " second" + (remainingSeconds > 1 ? "s" : ""));

    return parts.join(", ");
}

// Navigation logic
function checkNavigationProgress() {
    if (!isNavigating || !currentRoute || !currentLocation) return;
    
    if (currentStepIndex >= currentRoute.steps.length) {
        // Arrived at destination
        voice.speak("You have arrived at your destination!");
        isNavigating = false;
        return;
    }
    
    var currentStep = currentRoute.steps[currentStepIndex];
    var distanceToStep = calculateDistance(
        currentLocation.latitude, currentLocation.longitude,
        currentStep.endLat, currentStep.endLon
    ) * 1000; // Convert to meters
    
    // If within 20 meters of step endpoint, move to next step
    if (distanceToStep < 20) {
        currentStepIndex++;
        if (currentStepIndex < currentRoute.steps.length) {
            var nextStep = currentRoute.steps[currentStepIndex];
            voice.speak(buildRelativeStepSpeech(nextStep));
        }
    }
}

// Main navigation flow
function startNavigation() {
    print("[main] Starting navigation flow...");
    voice.captureOnce("Where would you like to go?", function(destination) {
        if (!destination || !destination.trim()) {
            voice.speak("I didn't catch that. Please try again.");
            return;
        }
        
        print("[main] User wants to go to: " + destination);
        voice.speak("Searching for " + destination + " near you...");
        
        searchNearbyPlace(destination, function(place) {
            var distanceText = formatPlaceDistance(place.distance);
            var confirmText = "I found " + place.name;
            if (place.address) {
                confirmText += " at " + place.address;
            }
            confirmText += ", " + distanceText + " away. Do you want to go there?";
            
            voice.confirmYesNo(confirmText, function(confirmed) {
                if (!confirmed) {
                    voice.speak("Okay, navigation cancelled.");
                    return;
                }
                
                voice.speak("Getting directions...");
                getDirections(place, function(route) {
                    currentRoute = route;
                    currentStepIndex = 0;
                    isNavigating = true;
                    
                    voice.speak("Starting navigation to " + place.name + ". Total distance: " + 
                              route.totalDistance + ", estimated time: " + route.totalDuration + ".");
                    
                    // Announce first step
                    if (route.steps.length > 0) {
                        var firstStep = route.steps[0];
                        voice.speak(buildRelativeStepSpeech(firstStep));
                    }
                    
                }, function(error) {
                    voice.speak("Sorry, I couldn't get directions. " + error);
                });
            }, { responseDelay: 1.0, listenDelay: 0.4 });
            
        }, function(error) {
            voice.speak("Sorry, I couldn't find " + destination + " nearby. " + error);
        });
    }, { responseDelay: 1.0, listenDelay: 0.5 });
}

// Initialize and start
print("[main] Initializing location tracking...");
initLocationTracking();

script.createEvent("OnStartEvent").bind(function() {
    print("[main] OnStartEvent triggered");
    
    // Start navigation flow after a short delay
    var delayed = script.createEvent("DelayedCallbackEvent");
    delayed.bind(function() {
        print("[main] Delayed callback triggered - starting navigation");
        startNavigation();
    });
    delayed.reset(2.0); // Wait 2 seconds for location to initialize
    print("[main] Delayed callback set for 2 seconds");
});