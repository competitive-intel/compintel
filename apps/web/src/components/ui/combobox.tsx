import { Check, ChevronsUpDown } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface ComboboxProps {
  id?: string;
  value: string;
  options: string[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  groupLabel?: string;
  disabled?: boolean;
  required?: boolean;
  maxLength?: number;
}

function Combobox({
  id,
  value,
  options,
  onValueChange,
  placeholder = "请选择…",
  searchPlaceholder = "搜索…",
  emptyText = "没有可用选项",
  groupLabel,
  disabled = false,
  required = false,
  maxLength,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-controls={listId}
          aria-expanded={open}
          aria-required={required}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span
            className={cn(
              "truncate",
              value.length === 0 && "text-muted-foreground",
            )}
          >
            {value || placeholder}
          </span>
          <ChevronsUpDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput
            value={value}
            onValueChange={onValueChange}
            placeholder={searchPlaceholder}
            maxLength={maxLength}
          />
          <CommandList id={listId}>
            <CommandEmpty>
              {value.length > 0 ? `将使用新名称“${value}”` : emptyText}
            </CommandEmpty>
            <CommandGroup heading={groupLabel}>
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => {
                    onValueChange(option);
                    setOpen(false);
                  }}
                >
                  {option}
                  <Check
                    className={cn(
                      "ml-auto",
                      value === option ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { Combobox, type ComboboxProps };
