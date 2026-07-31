"use client";

import { useState } from "react";

function formatBirthDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export function BirthDateInput() {
  const [value, setValue] = useState("");

  return (
    <input
      name="childDateOfBirth"
      type="text"
      inputMode="numeric"
      autoComplete="bday"
      required
      maxLength={10}
      pattern="\d{4}-\d{2}-\d{2}"
      placeholder="예: 2012-03-15"
      value={value}
      onChange={(event) => setValue(formatBirthDate(event.target.value))}
      aria-label="자녀 생년월일"
      title="생년월일 8자리를 입력해 주세요. 예: 2012-03-15"
      className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
    />
  );
}
