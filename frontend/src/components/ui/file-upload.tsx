"use client"

import * as React from "react"
import { useDropzone } from "react-dropzone"
import type { FileRejection } from "react-dropzone"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type FileUploadContextType = {
  files: File[]
  setFiles: (files: File[]) => void
}

const FileUploadContext = React.createContext<FileUploadContextType | null>(null)

export function FileUpload({
  value,
  onValueChange,
  maxFiles = 1,
  maxSize = Infinity,
  accept,
  className,
  children,
}: {
  value: File[]
  onValueChange: (files: File[]) => void
  maxFiles?: number
  maxSize?: number
  accept?: any
  className?: string
  children: React.ReactNode
}) {
  const onDrop = React.useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) {
        toast.error("Invalid file type or file too large.")
      }

      const valid = acceptedFiles
        .filter((file) => file.size <= maxSize)
        .slice(0, maxFiles)

      onValueChange(valid)
    },
    [onValueChange, maxFiles, maxSize]
  )

  const dropzone = useDropzone({
    onDrop,
    maxFiles,
    maxSize,
    accept,
  })

  return (
    <FileUploadContext.Provider
      value={{
        files: value,
        setFiles: onValueChange,
      }}
    >
      <div
        {...dropzone.getRootProps()}
        className={cn("space-y-2", className)}
      >
        <input {...dropzone.getInputProps()} />
        {children}
      </div>
    </FileUploadContext.Provider>
  )
}

export function FileUploadTrigger({
  children,
}: {
  asChild?: boolean
  children: React.ReactNode
}) {
  return <div>{children}</div>
}

export function FileUploadList({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2">{children}</div>
}

export function FileUploadItem({
  children,
}: {
  value: File
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-2">
      {children}
    </div>
  )
}

export function FileUploadItemPreview() {
  const ctx = React.useContext(FileUploadContext)
  if (!ctx) return null

  const file = ctx.files[0]
  if (!file) return null

  const url = URL.createObjectURL(file)

  if (file.type.startsWith("image")) {
    return (
      <img
        src={url}
        className="h-10 w-10 rounded object-cover"
        alt="preview"
      />
    )
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-xs">
      FILE
    </div>
  )
}

export function FileUploadItemMetadata() {
  const ctx = React.useContext(FileUploadContext)
  if (!ctx) return null

  const file = ctx.files[0]
  if (!file) return null

  const size = (file.size / 1024 / 1024).toFixed(2)

  return (
    <div className="flex flex-col text-sm">
      <span>{file.name}</span>
      <span className="text-muted-foreground text-xs">{size} MB</span>
    </div>
  )
}

export function FileUploadItemDelete({
  asChild,
  children,
}: {
  asChild?: boolean
  children: React.ReactNode
}) {
  const ctx = React.useContext(FileUploadContext)
  if (!ctx) return null

  const remove = () => ctx.setFiles([])

  if (
    asChild &&
    React.isValidElement<{ onClick?: React.MouseEventHandler<HTMLElement> }>(children)
  ) {
    return React.cloneElement(children, {
      onClick: remove,
    })
  }

  return (
    <button
      type="button"
      onClick={remove}
      className="ml-auto text-sm text-red-500"
    >
      delete
    </button>
  )
}