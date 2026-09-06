"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type InputHTMLAttributes,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export type FileMetadata = {
  name: string;
  size: number;
  type: string;
  url: string;
  id: string;
};
export type FileWithPreview = {
  file: File | FileMetadata;
  id: string;
  preview?: string;
};
export type FileUploadOptions = {
  maxFiles?: number;
  maxSize?: number;
  accept?: string;
  multiple?: boolean;
  initialFiles?: FileMetadata[];
  onFilesChange?: (files: FileWithPreview[]) => void;
  onFilesAdded?: (files: FileWithPreview[]) => void;
};
export type FileUploadState = {
  files: FileWithPreview[];
  isDragging: boolean;
  errors: string[];
};
export type FileUploadActions = {
  addFiles: (files: FileList | File[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  clearErrors: () => void;
  handleDragEnter: (event: DragEvent<HTMLElement>) => void;
  handleDragLeave: (event: DragEvent<HTMLElement>) => void;
  handleDragOver: (event: DragEvent<HTMLElement>) => void;
  handleDrop: (event: DragEvent<HTMLElement>) => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  openFileDialog: () => void;
  getInputProps: (
    props?: InputHTMLAttributes<HTMLInputElement>,
  ) => InputHTMLAttributes<HTMLInputElement> & {
    ref: RefObject<HTMLInputElement | null>;
  };
};

/** Format a nonnegative byte count using binary units. */
export function formatBytes(
  bytes: number,
  decimals = 2,
  addSpace = false,
): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Invalid size";
  if (bytes === 0) return "0 Bytes";
  const units = [
    "Bytes",
    "KB",
    "MB",
    "GB",
    "TB",
    "PB",
    "EB",
    "ZB",
    "YB",
  ] as const;
  const index = Math.max(
    0,
    Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024))),
  );
  const precision = Number.isFinite(decimals)
    ? Math.max(0, Math.min(100, Math.trunc(decimals)))
    : 2;
  return `${Number((bytes / 1024 ** index).toFixed(precision))}${addSpace ? " " : ""}${units[index]}`;
}

function acceptsFile(file: File, accept: string): boolean {
  const types = accept
    .toLowerCase()
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);
  return (
    types.length === 0 ||
    types.some(
      (type) =>
        type === "*" ||
        type === "*/*" ||
        (type.startsWith(".")
          ? file.name.toLowerCase().endsWith(type)
          : type.endsWith("/*")
            ? file.type.toLowerCase().startsWith(type.slice(0, -1))
            : file.type.toLowerCase() === type),
    )
  );
}

/** Manage local file selection and owned preview URLs. Validate uploaded bytes again on the server. */
export function useFileUpload({
  maxFiles = Infinity,
  maxSize = Infinity,
  accept = "*",
  multiple = false,
  initialFiles = [],
  onFilesChange,
  onFilesAdded,
}: FileUploadOptions = {}): [FileUploadState, FileUploadActions] {
  const [state, setState] = useState<FileUploadState>(() => ({
    files: initialFiles.map((file) => ({
      file,
      id: file.id,
      preview: file.url,
    })),
    errors: [],
    isDragging: false,
  }));
  const current = useRef(state);
  const inputRef = useRef<HTMLInputElement>(null);
  const ownedUrls = useRef(new Set<string>());
  const dragDepth = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const urls = ownedUrls.current;
    return () => {
      mounted.current = false;
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const update = useCallback((patch: Partial<FileUploadState>) => {
    current.current = { ...current.current, ...patch };
    setState(current.current);
  }, []);
  const release = useCallback((files: FileWithPreview[]) => {
    for (const { preview } of files) {
      if (preview && ownedUrls.current.delete(preview))
        URL.revokeObjectURL(preview);
    }
  }, []);
  const resetInput = useCallback(() => {
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      if (!mounted.current || incoming.length === 0) return;
      const errors: string[] = [];
      const existing = current.current.files;
      const candidates: File[] = [];
      const limit = Number.isNaN(maxFiles)
        ? 0
        : Math.max(0, Math.floor(maxFiles));
      for (const file of Array.from(incoming)) {
        if (file.size > maxSize || Number.isNaN(maxSize) || maxSize < 0) {
          errors.push(
            `File "${file.name}" exceeds the maximum size of ${formatBytes(maxSize)}.`,
          );
          continue;
        }
        if (!acceptsFile(file, accept)) {
          errors.push(`File "${file.name}" is not an accepted file type.`);
          continue;
        }
        if (
          multiple &&
          [...existing.map((entry) => entry.file), ...candidates].some(
            (entry) =>
              entry.name === file.name &&
              entry.size === file.size &&
              entry.type === file.type,
          )
        )
          continue;
        if (multiple && existing.length + candidates.length >= limit) {
          if (
            !errors.includes(`You can only upload a maximum of ${limit} files.`)
          )
            errors.push(`You can only upload a maximum of ${limit} files.`);
          continue;
        }
        candidates.push(file);
        if (!multiple) break;
      }
      const added: FileWithPreview[] = [];
      for (const file of candidates) {
        try {
          const id = crypto.randomUUID();
          const preview = URL.createObjectURL(file);
          ownedUrls.current.add(preview);
          added.push({ file, id, preview });
        } catch {
          errors.push(`Unable to prepare file "${file.name}".`);
        }
      }
      resetInput();
      if (added.length === 0) {
        update({ errors });
        return;
      }
      const files = multiple ? [...existing, ...added] : added;
      if (!multiple) release(existing);
      update({ files, errors });
      onFilesChange?.(files);
      onFilesAdded?.(added);
    },
    [
      accept,
      maxFiles,
      maxSize,
      multiple,
      onFilesAdded,
      onFilesChange,
      release,
      resetInput,
      update,
    ],
  );

  const removeFile = useCallback(
    (id: string) => {
      if (!mounted.current) return;
      const existing = current.current.files;
      const removed = existing.filter((entry) => entry.id === id);
      if (removed.length === 0) return;
      release(removed);
      const files = existing.filter((entry) => entry.id !== id);
      resetInput();
      update({ files, errors: [] });
      onFilesChange?.(files);
    },
    [onFilesChange, release, resetInput, update],
  );
  const clearFiles = useCallback(() => {
    if (!mounted.current) return;
    release(current.current.files);
    resetInput();
    update({ files: [], errors: [] });
    onFilesChange?.([]);
  }, [onFilesChange, release, resetInput, update]);
  const clearErrors = useCallback(() => update({ errors: [] }), [update]);
  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (inputRef.current?.disabled) return;
      dragDepth.current += 1;
      update({ isDragging: true });
    },
    [update],
  );
  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) update({ isDragging: false });
    },
    [update],
  );
  const handleDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);
  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepth.current = 0;
      update({ isDragging: false });
      if (!inputRef.current?.disabled) addFiles(event.dataTransfer.files);
    },
    [addFiles, update],
  );
  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!event.currentTarget.disabled && event.currentTarget.files)
        addFiles(event.currentTarget.files);
    },
    [addFiles],
  );
  const openFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);
  const getInputProps = useCallback(
    (props: InputHTMLAttributes<HTMLInputElement> = {}) => ({
      ...props,
      type: "file" as const,
      accept,
      multiple,
      ref: inputRef,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        props.onChange?.(event);
        if (!event.defaultPrevented) handleFileChange(event);
      },
    }),
    [accept, multiple, handleFileChange],
  );
  return [
    state,
    {
      addFiles,
      removeFile,
      clearFiles,
      clearErrors,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      handleFileChange,
      openFileDialog,
      getInputProps,
    },
  ];
}
