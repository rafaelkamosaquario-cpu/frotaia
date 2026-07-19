"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ArrowUp, Paperclip, X } from "lucide-react";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { FOOTER_DISCLAIMER, INPUT_PLACEHOLDER } from "@/lib/constants";
import type { ChatImage } from "@/types";

const MAX_HEIGHT_PX = 200;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  image: ChatImage | null;
  onImageChange: (image: ChatImage | null) => void;
  onSend: () => void;
  disabled?: boolean;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ChatInput({
  value,
  onChange,
  image,
  onImageChange,
  onSend,
  disabled,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if ((value.trim() || image) && !disabled) onSend();
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImageError(null);

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setImageError("Formato nao suportado. Envie uma imagem JPG, PNG, WEBP ou GIF.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Imagem muito grande. O limite e de 5MB.");
      return;
    }

    try {
      const data = await readFileAsBase64(file);
      onImageChange({ mediaType: file.type, data, name: file.name });
    } catch {
      setImageError("Nao foi possivel ler a imagem. Tente novamente.");
    }
  };

  const handleRemoveImage = () => {
    onImageChange(null);
    setImageError(null);
  };

  return (
    <div className="shrink-0 border-t border-border bg-surface/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:px-4 sm:pb-4">
      <div className="mx-auto w-full max-w-2xl">
        {image && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-surface p-2">
            <img
              src={`data:${image.mediaType};base64,${image.data}`}
              alt={image.name ?? "Imagem anexada"}
              className="size-12 rounded-lg object-cover"
            />
            <span className="flex-1 truncate text-xs text-muted-foreground">
              {image.name ?? "Imagem anexada"}
            </span>
            <button
              type="button"
              onClick={handleRemoveImage}
              aria-label="Remover imagem"
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-muted"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
        {imageError && <p className="mb-2 text-xs text-danger">{imageError}</p>}
        <div className="flex w-full items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mb-0.5 rounded-full"
            onClick={handleAttachClick}
            disabled={disabled}
            aria-label="Anexar imagem (cupom fiscal, foto do painel, etc.)"
          >
            <Paperclip className="size-4.5" aria-hidden />
          </Button>
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={INPUT_PLACEHOLDER}
            rows={1}
            className="max-h-[200px] flex-1 border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            size="icon"
            className="mb-0.5 rounded-full"
            disabled={(!value.trim() && !image) || disabled}
            onClick={onSend}
            aria-label="Enviar mensagem"
          >
            <ArrowUp className="size-4.5" aria-hidden />
          </Button>
        </div>
      </div>
      <p className="mx-auto mt-2.5 max-w-lg text-center text-[11px] leading-relaxed tracking-wide text-muted-foreground/80">
        {FOOTER_DISCLAIMER}
      </p>
    </div>
  );
}
