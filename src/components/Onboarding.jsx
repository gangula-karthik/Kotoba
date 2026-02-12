import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronDownIcon, CheckIcon } from "lucide-react";

const LANGUAGES = [
  { name: "English", code: "en" },
  { name: "Chinese", code: "zh" },
  { name: "German", code: "de" },
  { name: "Spanish", code: "es" },
  { name: "Russian", code: "ru" },
  { name: "Korean", code: "ko" },
  { name: "French", code: "fr" },
  { name: "Japanese", code: "ja" },
  { name: "Portuguese", code: "pt" },
  { name: "Turkish", code: "tr" },
  { name: "Polish", code: "pl" },
  { name: "Catalan", code: "ca" },
  { name: "Dutch", code: "nl" },
  { name: "Arabic", code: "ar" },
  { name: "Swedish", code: "sv" },
  { name: "Italian", code: "it" },
  { name: "Indonesian", code: "id" },
  { name: "Hindi", code: "hi" },
  { name: "Finnish", code: "fi" },
  { name: "Vietnamese", code: "vi" },
  { name: "Hebrew", code: "he" },
  { name: "Ukrainian", code: "uk" },
  { name: "Greek", code: "el" },
  { name: "Malay", code: "ms" },
  { name: "Czech", code: "cs" },
  { name: "Romanian", code: "ro" },
  { name: "Danish", code: "da" },
  { name: "Hungarian", code: "hu" },
  { name: "Tamil", code: "ta" },
  { name: "Norwegian", code: "no" },
  { name: "Thai", code: "th" },
  { name: "Urdu", code: "ur" },
  { name: "Croatian", code: "hr" },
  { name: "Bulgarian", code: "bg" },
  { name: "Lithuanian", code: "lt" },
  { name: "Latin", code: "la" },
  { name: "Māori", code: "mi" },
  { name: "Malayalam", code: "ml" },
  { name: "Welsh", code: "cy" },
  { name: "Slovak", code: "sk" },
  { name: "Telugu", code: "te" },
  { name: "Persian", code: "fa" },
  { name: "Latvian", code: "lv" },
  { name: "Bengali", code: "bn" },
  { name: "Serbian", code: "sr" },
  { name: "Azerbaijani", code: "az" },
  { name: "Slovenian", code: "sl" },
  { name: "Kannada", code: "kn" },
  { name: "Estonian", code: "et" },
  { name: "Macedonian", code: "mk" },
  { name: "Breton", code: "br" },
  { name: "Basque", code: "eu" },
  { name: "Icelandic", code: "is" },
  { name: "Armenian", code: "hy" },
  { name: "Nepali", code: "ne" },
  { name: "Mongolian", code: "mn" },
  { name: "Bosnian", code: "bs" },
  { name: "Kazakh", code: "kk" },
  { name: "Albanian", code: "sq" },
  { name: "Swahili", code: "sw" },
  { name: "Galician", code: "gl" },
  { name: "Marathi", code: "mr" },
  { name: "Panjabi", code: "pa" },
  { name: "Sinhala", code: "si" },
  { name: "Khmer", code: "km" },
  { name: "Shona", code: "sn" },
  { name: "Yoruba", code: "yo" },
  { name: "Somali", code: "so" },
  { name: "Afrikaans", code: "af" },
  { name: "Occitan", code: "oc" },
  { name: "Georgian", code: "ka" },
  { name: "Belarusian", code: "be" },
  { name: "Tajik", code: "tg" },
  { name: "Sindhi", code: "sd" },
  { name: "Gujarati", code: "gu" },
  { name: "Amharic", code: "am" },
  { name: "Yiddish", code: "yi" },
  { name: "Lao", code: "lo" },
  { name: "Uzbek", code: "uz" },
  { name: "Faroese", code: "fo" },
  { name: "Haitian", code: "ht" },
  { name: "Pashto", code: "ps" },
  { name: "Turkmen", code: "tk" },
  { name: "Norwegian Nynorsk", code: "nn" },
  { name: "Maltese", code: "mt" },
  { name: "Sanskrit", code: "sa" },
  { name: "Luxembourgish", code: "lb" },
  { name: "Burmese", code: "my" },
  { name: "Tibetan", code: "bo" },
  { name: "Tagalog", code: "tl" },
  { name: "Malagasy", code: "mg" },
  { name: "Assamese", code: "as" },
  { name: "Tatar", code: "tt" },
  { name: "Hawaiian", code: "haw" },
  { name: "Lingala", code: "ln" },
  { name: "Hausa", code: "ha" },
  { name: "Bashkir", code: "ba" },
  { name: "Javanese", code: "jw" },
];

function PermissionRow({ label, status, onRequest, granted }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <Badge variant={granted ? "default" : "outline"}>
          {granted ? "granted" : status}
        </Badge>
        {!granted && (
          <button
            onClick={onRequest}
            className="text-xs px-3 py-1 border border-border text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Grant
          </button>
        )}
      </div>
    </div>
  );
}

function LanguageDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);

  const selectedName =
    LANGUAGES.find((l) => l.code === value)?.name || "English";

  const filtered = useMemo(() => {
    if (!search.trim()) return LANGUAGES;
    const q = search.toLowerCase();
    return LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)
    );
  }, [search]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search when opened
  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus();
    }
  }, [open]);

  // Scroll selected item into view when opened
  useEffect(() => {
    if (open && listRef.current) {
      const selected = listRef.current.querySelector("[data-selected='true']");
      if (selected) {
        selected.scrollIntoView({ block: "nearest" });
      }
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border border-input bg-transparent px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-secondary/50 transition-colors"
      >
        <span>{selectedName}</span>
        <ChevronDownIcon
          className={`size-4 opacity-50 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 border border-border bg-popover text-popover-foreground rounded-md shadow-md overflow-hidden">
          <div className="p-1.5">
            <Input
              ref={searchRef}
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div
            ref={listRef}
            className="max-h-48 overflow-y-auto overscroll-contain"
          >
            {filtered.map((lang) => (
              <button
                key={lang.code}
                type="button"
                data-selected={lang.code === value}
                onClick={() => {
                  onChange(lang.code);
                  setOpen(false);
                  setSearch("");
                }}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                  lang.code === value
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                }`}
              >
                <span className="w-4 flex-shrink-0">
                  {lang.code === value && <CheckIcon className="size-3.5" />}
                </span>
                <span className="flex-1 text-left">{lang.name}</span>
                <span className="text-xs text-muted-foreground">
                  {lang.code}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                No languages found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Onboarding() {
  const [permissions, setPermissions] = useState({
    microphone: "not-determined",
    accessibility: false,
  });
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [loading, setLoading] = useState(false);

  // Load permissions on mount
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getPermissions().then(setPermissions);
  }, []);

  // Poll permissions every 2s to catch changes made in System Preferences
  useEffect(() => {
    if (!window.electronAPI) return;
    const interval = setInterval(() => {
      window.electronAPI.getPermissions().then(setPermissions);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleRequestMicrophone = useCallback(async () => {
    if (!window.electronAPI) return;
    const status = await window.electronAPI.requestMicrophone();
    setPermissions((p) => ({ ...p, microphone: status }));
  }, []);

  const handleRequestAccessibility = useCallback(async () => {
    if (!window.electronAPI) return;
    const granted = await window.electronAPI.requestAccessibility();
    setPermissions((p) => ({ ...p, accessibility: granted }));
  }, []);

  const handleComplete = useCallback(async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    await window.electronAPI.completeOnboarding({ language: selectedLanguage });
  }, [selectedLanguage]);

  const micGranted = permissions.microphone === "granted";

  return (
    <div className="onboarding-wrapper">
      {/* Drag handle — only the top bar area */}
      <div className="onboarding-drag-handle" />

      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-base font-medium text-foreground">
          openwisprflow
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Speech-to-text dictation setup
        </p>
      </div>

      {/* Permissions */}
      <div className="px-6 pb-4">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Permissions
        </h2>
        <div className="border border-border divide-y divide-border">
          <div className="px-3">
            <PermissionRow
              label="Microphone"
              status={permissions.microphone}
              granted={micGranted}
              onRequest={handleRequestMicrophone}
            />
          </div>
          <div className="px-3">
            <PermissionRow
              label="Accessibility"
              status={permissions.accessibility ? "granted" : "not granted"}
              granted={permissions.accessibility}
              onRequest={handleRequestAccessibility}
            />
          </div>
        </div>
        {!micGranted && (
          <p className="text-xs text-destructive mt-2">
            Microphone access is required to continue.
          </p>
        )}
      </div>

      {/* Language Selection */}
      <div className="px-6 pb-4">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Transcription Language
        </h2>
        <LanguageDropdown
          value={selectedLanguage}
          onChange={setSelectedLanguage}
        />
      </div>

      {/* Footer */}
      <div className="px-6 pb-6 pt-2">
        <button
          onClick={handleComplete}
          disabled={!micGranted || loading}
          className={`w-full py-2 text-sm font-medium transition-colors cursor-pointer ${
            micGranted && !loading
              ? "bg-foreground text-background hover:bg-foreground/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          {loading ? "Starting..." : "Get Started"}
        </button>
      </div>
    </div>
  );
}
