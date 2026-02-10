import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

const TranscriptionView = ({ transcription, currentSegment, isRecording }) => {
  const displayText = transcription + (currentSegment ? currentSegment : "");

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-6 min-h-0">
          {displayText ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                {transcription}
                <span className="text-muted-foreground italic">
                  {currentSegment}
                </span>
              </p>
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-12">
              <p className="text-lg mb-2">
                {isRecording ? "Listening..." : "Ready to transcribe"}
              </p>
              <p className="text-sm">
                {isRecording
                  ? "Speak clearly into your microphone"
                  : "Click the microphone button to start recording"
                }
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default TranscriptionView;