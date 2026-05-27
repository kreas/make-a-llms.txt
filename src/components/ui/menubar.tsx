"use client"

import * as React from "react"
import { Menubar as MenubarPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

function Menubar({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Root>) {
  return (
    <MenubarPrimitive.Root
      data-slot="menubar"
      className={cn(
        "flex h-9 items-center gap-1 rounded-lg border border-hairline bg-canvas-soft p-1 w-fit shadow-xs",
        className
      )}
      {...props}
    />
  )
}

function MenubarMenu({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Menu>) {
  return <MenubarPrimitive.Menu data-slot="menubar-menu" {...props} />
}

interface MenubarTriggerProps extends React.ComponentProps<typeof MenubarPrimitive.Trigger> {
  isActive?: boolean
}

function MenubarTrigger({
  className,
  isActive,
  ...props
}: MenubarTriggerProps) {
  return (
    <MenubarPrimitive.Trigger
      data-slot="menubar-trigger"
      data-active={isActive ? "true" : undefined}
      className={cn(
        "flex cursor-default items-center rounded-md px-3 py-1 text-sm font-medium outline-none select-none transition-all",
        "text-muted-strong hover:text-ink hover:bg-canvas-soft/50",
        "focus-visible:bg-canvas-soft/50 focus-visible:text-ink focus-visible:outline-none",
        "data-[active=true]:bg-surface-card data-[active=true]:text-ink data-[active=true]:border-hairline-strong/30 border border-transparent",
        "data-[state=open]:bg-canvas-soft/50 data-[state=open]:text-ink",
        className
      )}
      {...props}
    />
  )
}

function MenubarPortal({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Portal>) {
  return <MenubarPrimitive.Portal {...props} />
}

function MenubarContent({
  className,
  align = "start",
  alignOffset = -4,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Content>) {
  return (
    <MenubarPrimitive.Portal>
      <MenubarPrimitive.Content
        data-slot="menubar-content"
        align={align}
        alignOffset={alignOffset}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[12rem] overflow-hidden rounded-md border border-hairline bg-surface-card p-1 text-ink shadow-md origin-top-left",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </MenubarPrimitive.Portal>
  )
}

function MenubarItem({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Item> & {
  inset?: boolean
}) {
  return (
    <MenubarPrimitive.Item
      data-slot="menubar-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none",
        "text-muted-strong focus:bg-canvas-soft focus:text-ink",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8",
        className
      )}
      {...props}
    />
  )
}

function MenubarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Separator>) {
  return (
    <MenubarPrimitive.Separator
      data-slot="menubar-separator"
      className={cn("-mx-1 my-1 h-px bg-hairline", className)}
      {...props}
    />
  )
}

export {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarPortal,
  MenubarSeparator,
}
