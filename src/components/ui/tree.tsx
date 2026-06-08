"use client"

import * as React from "react"
import { ItemInstance } from "@headless-tree/core"
import { ChevronDownIcon } from "lucide-react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

interface TreeContextValue<T = unknown> {
  indent: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentItem?: ItemInstance<T> | ItemInstance<any>
  tree?: unknown
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TreeContext = React.createContext<TreeContextValue<any>>({
  indent: 20,
  currentItem: undefined,
  tree: undefined,
})

function useTreeContext<T = unknown>() {
  return React.useContext(TreeContext) as TreeContextValue<T>
}

interface TreeProps extends React.HTMLAttributes<HTMLDivElement> {
  indent?: number
  tree?: { getContainerProps?: () => Record<string, unknown> }
}

function Tree({ indent = 20, tree, className, ...props }: TreeProps) {
  const containerProps =
    tree && typeof tree.getContainerProps === "function"
      ? tree.getContainerProps()
      : {}
  const mergedProps = { ...props, ...containerProps }
  const { style: propStyle, ...otherProps } = mergedProps as React.HTMLAttributes<HTMLDivElement>
  const mergedStyle = {
    ...propStyle,
    "--tree-indent": `${indent}px`,
  } as React.CSSProperties

  return (
    <TreeContext.Provider value={{ indent, tree }}>
      <div
        data-slot="tree"
        style={mergedStyle}
        className={cn("flex flex-col", className)}
        {...otherProps}
      />
    </TreeContext.Provider>
  )
}

interface TreeItemProps<T = unknown> extends React.HTMLAttributes<HTMLButtonElement> {
  item: ItemInstance<T>
  asChild?: boolean
}

function TreeItem<T = unknown>({
  item,
  className,
  asChild,
  children,
  ...props
}: TreeItemProps<T>) {
  const { indent } = useTreeContext<T>()
  const itemProps = typeof item.getProps === "function" ? item.getProps() : {}
  const mergedProps = { ...props, ...itemProps }
  const { style: propStyle, ...otherProps } = mergedProps as React.HTMLAttributes<HTMLButtonElement>
  const mergedStyle = {
    ...propStyle,
    "--tree-padding": `${item.getItemMeta().level * indent}px`,
  } as React.CSSProperties

  const Comp = asChild ? Slot.Root : "button"

  return (
    <TreeContext.Provider value={{ indent, currentItem: item }}>
      <Comp
        data-slot="tree-item"
        style={mergedStyle}
        className={cn(
          "z-10 ps-(--tree-padding) outline-hidden select-none not-last:pb-0.5 focus:z-20 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
          className
        )}
        data-focus={typeof item.isFocused === "function" ? item.isFocused() || false : undefined}
        data-folder={typeof item.isFolder === "function" ? item.isFolder() || false : undefined}
        data-selected={typeof item.isSelected === "function" ? item.isSelected() || false : undefined}
        data-search-match={typeof item.isMatchingSearch === "function" ? item.isMatchingSearch() || false : undefined}
        aria-expanded={typeof item.isExpanded === "function" ? item.isExpanded() : undefined}
        {...otherProps}
      >
        {children}
      </Comp>
    </TreeContext.Provider>
  )
}

interface TreeItemLabelProps<T = unknown> extends React.HTMLAttributes<HTMLSpanElement> {
  item?: ItemInstance<T>
}

function TreeItemLabel<T = unknown>({
  item: propItem,
  children,
  className,
  ...props
}: TreeItemLabelProps<T>) {
  const { currentItem } = useTreeContext<T>()
  const item = propItem || currentItem
  if (!item) return null

  return (
    <span
      data-slot="tree-item-label"
      className={cn(
        "in-focus-visible:ring-ring/50 in-focus-visible:ring-[3px] flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-body transition-colors not-in-data-[folder=true]:ps-7 hover:bg-surface-strong/50 in-data-[selected=true]:bg-surface-strong in-data-[selected=true]:font-medium in-data-[selected=true]:text-ink in-data-[search-match=true]:bg-surface-strong/50 in-data-[drag-target=true]:bg-surface-strong/50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      {item.isFolder() && (
        <ChevronDownIcon className="text-muted-strong size-4 in-aria-[expanded=false]:-rotate-90" />
      )}
      {children || (typeof item.getItemName === "function" ? item.getItemName() : null)}
    </span>
  )
}

export { Tree, TreeItem, TreeItemLabel }
