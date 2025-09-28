// @input Asset.VoiceMLModule voiceML
// @input Asset.TextToSpeechModule tts

// Voice utilities: TTS and speech recognition

var voiceModule = null;
var ttsModule = null;
var audioComponent = null;
var scriptContext = null;

var isListening = false;
var latestTranscript = "";

var speaking = false;
var speakQueue = [];

function init(vml, tts, audioComp, scriptCtx) {
    voiceModule = vml;
    ttsModule = tts;
    audioComponent = audioComp;
    scriptContext = scriptCtx;
    
    print("[voice] Initializing voice module...");
    
    if (voiceModule) {
        voiceModule.onListeningEnabled.add(function() {
            print("[voice] Microphone enabled and ready");
        });
        
        voiceModule.onListeningDisabled.add(function() {
            print("[voice] Microphone disabled");
        });
        
        voiceModule.onListeningError.add(function(err) {
            print("[voice] Listening error: " + (err ? err.description : "unknown"));
        });
        
        print("[voice] Voice module initialized successfully");
    } else {
        print("[voice] ERROR: Voice module is null!");
    }
    
    if (ttsModule) {
        print("[voice] TTS module initialized");
    } else {
        print("[voice] ERROR: TTS module is null!");
    }
}

function enqueueSpeak(text, onDone, onError, options) {
    speakQueue.push({
        text: text,
        onDone: onDone,
        onError: onError,
        options: options || {}
    });
    processSpeakQueue();
}

function processSpeakQueue() {
    if (speaking || !speakQueue.length) {
        return;
    }
    speaking = true;
    var item = speakQueue.shift();
    performSpeak(item.text, function(result) {
        speaking = false;
        if (item.onDone) { item.onDone(result); }
        processSpeakQueue();
    }, function(err) {
        speaking = false;
        if (item.onError) { item.onError(err); }
        processSpeakQueue();
    }, item.options);
}

function performSpeak(text, onDone, onError, options) {
    if (!ttsModule) {
        print("[voice] TTS not initialized");
        if (onError) onError("TTS not available");
        return;
    }
    var opts = TextToSpeech.Options.create();
    try {
        ttsModule.synthesize(text, opts, function(audioTrackAsset) {
            print("[voice] TTS synthesized: " + text);
            var finished = false;
            var updateEvent = null;
            var fallbackEvent = null;
            var markFinished = function(result) {
                if (finished) { return; }
                finished = true;
                if (updateEvent) {
                    updateEvent.enabled = false;
                    updateEvent = null;
                }
                if (fallbackEvent) {
                    fallbackEvent.enabled = false;
                    fallbackEvent = null;
                }
                if (onDone) { onDone(result); }
            };
            var handleFailure = function(err) {
                if (finished) { return; }
                finished = true;
                if (updateEvent) {
                    updateEvent.enabled = false;
                    updateEvent = null;
                }
                if (fallbackEvent) {
                    fallbackEvent.enabled = false;
                    fallbackEvent = null;
                }
                if (onError) { onError(err); }
            };
            if (audioComponent) {
                audioComponent.audioTrack = audioTrackAsset;
                var hasSetHandler = false;
                if (audioComponent.setOnFinish) {
                    hasSetHandler = true;
                    audioComponent.setOnFinish(function() {
                        print("[voice] Audio finished (setOnFinish)");
                        markFinished(audioTrackAsset);
                    });
                }
                var wasPlaying = false;
                updateEvent = scriptContext.createEvent("UpdateEvent");
                updateEvent.bind(function() {
                    if (!audioComponent) {
                        markFinished(audioTrackAsset);
                        return;
                    }
                    var playing = audioComponent.isPlaying ? audioComponent.isPlaying() : false;
                    if (playing) {
                        wasPlaying = true;
                    } else if (wasPlaying) {
                        print("[voice] Audio finished (poll)");
                        markFinished(audioTrackAsset);
                    }
                });
                audioComponent.play(1);
                fallbackEvent = scriptContext.createEvent("DelayedCallbackEvent");
                fallbackEvent.bind(function() {
                    if (finished) { return; }
                    if (!wasPlaying) {
                        print("[voice] Audio fallback triggered");
                        if (audioTrackAsset && audioTrackAsset.play) {
                            audioTrackAsset.play(1);
                        }
                        markFinished(audioTrackAsset);
                    }
                });
                fallbackEvent.reset(1.0);
            } else {
                if (audioTrackAsset && audioTrackAsset.play) {
                    audioTrackAsset.play(1);
                    markFinished(audioTrackAsset);
                } else {
                    markFinished(audioTrackAsset);
                }
            }
        }, function(error, description) {
            print("[voice] TTS error: " + error + " - " + description);
            if (onError) onError(description);
        });
    } catch (e) {
        print("[voice] TTS synth exception: " + e);
        if (onError) onError(e.toString());
    }
}

function startListening(onUpdate) {
    print("[voice] startListening called, voiceModule=" + (voiceModule ? "exists" : "null"));
    
    if (!voiceModule) {
        print("[voice] Voice module not initialized");
        return;
    }
    
    if (isListening) {
        print("[voice] Already listening, stopping first");
        stopListening();
    }
    
    var options = VoiceML.ListeningOptions.create();
    options.languageCode = "en-US";
    options.shouldReturnAsrTranscription = true;
    options.shouldReturnInterimAsrTranscription = true; // Enable interim results for debugging
    
    // Clear any existing listeners first
    print("[voice] Checking onListeningUpdate: " + (voiceModule.onListeningUpdate ? "exists" : "null"));
    if (voiceModule.onListeningUpdate && voiceModule.onListeningUpdate.removeAll) {
        print("[voice] Clearing existing listeners");
        voiceModule.onListeningUpdate.removeAll();
    }
    
    print("[voice] Adding new listener");
    voiceModule.onListeningUpdate.add(function(args) {
        if (args && args.transcription) {
            print("[voice] Transcript (final=" + args.isFinalTranscription + "): " + args.transcription);
            if (onUpdate) {
                try {
                    onUpdate(args.transcription, !!args.isFinalTranscription);
                } catch (cbErr) {
                    print("[voice] onUpdate error: " + cbErr);
                }
            }
            if (args.isFinalTranscription) {
                latestTranscript = args.transcription;
            }
        }
    });
    
    try {
        voiceModule.startListening(options);
        isListening = true;
        print("[voice] Started listening...");
    } catch (e) {
        print("[voice] Error starting listening: " + e);
    }
}

function stopListening() {
    if (voiceModule && isListening) {
        voiceModule.stopListening();
        isListening = false;
    }
}

function captureOnce(promptText, onResult, options) {
    print("[voice] captureOnce called with: " + promptText);
    enqueueSpeak(promptText, function() {
        var captured = false;
        var timeout = false;
        var timeoutEvent = null;
        print("[voice] Starting listening for capture...");
        startListening(function(transcript, isFinal) {
            print("[voice] Received transcript in captureOnce: " + transcript + " (final=" + isFinal + ")");
            if (captured || timeout) return;
            if (!isFinal) {
                return;
            }
            captured = true;
            timeout = true;
            stopListening();
            onResult(transcript);
        });
        timeoutEvent = scriptContext.createEvent("DelayedCallbackEvent");
        timeoutEvent.bind(function() {
            print("[voice] Capture timeout reached");
            if (captured) return;
            timeout = true;
            stopListening();
            onResult("");
        });
        timeoutEvent.reset(10.0);
    }, function(error) {
        print("[voice] TTS error in captureOnce: " + error);
        onResult("");
    }, options);
}

function confirmYesNo(promptText, onDecision, options) {
    options = options || {};
    enqueueSpeak(promptText, function() {
        var decided = false;
        var timeout = false;
        var timeoutEvent = null;
        startListening(function(transcript, isFinal) {
            if (decided || timeout) return;
            var text = transcript.toLowerCase();
            if (text.indexOf("yes") !== -1 || text.indexOf("yeah") !== -1 || 
                text.indexOf("yep") !== -1 || text.indexOf("sure") !== -1) {
                decided = true;
                timeout = true;
                stopListening();
                onDecision(true);
            } else if (text.indexOf("no") !== -1 || text.indexOf("nope") !== -1 || 
                      text.indexOf("cancel") !== -1) {
                decided = true;
                timeout = true;
                stopListening();
                onDecision(false);
            } else if (isFinal) {
                decided = true;
                timeout = true;
                stopListening();
                onDecision(false);
            }
        });
        timeoutEvent = scriptContext.createEvent("DelayedCallbackEvent");
        timeoutEvent.bind(function() {
            if (decided) return;
            timeout = true;
            stopListening();
            onDecision(false);
        });
        timeoutEvent.reset(8.0);
    }, null, options);
}

module.exports = {
    init: init,
    speak: enqueueSpeak,
    captureOnce: captureOnce,
    confirmYesNo: confirmYesNo
};