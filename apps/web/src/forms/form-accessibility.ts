export interface ValidationIssue {
  path: PropertyKey[];
}

export function getInvalidFieldNames(issues: readonly ValidationIssue[]): ReadonlySet<string> {
  const fieldNames = new Set<string>();

  for (const issue of issues) {
    const fieldName = issue.path[0];

    if (typeof fieldName === "string") {
      fieldNames.add(fieldName);
    }
  }

  return fieldNames;
}

export function focusFirstInvalidFormControl(
  form: HTMLFormElement,
  fieldNames: Iterable<string>,
): void {
  const [firstFieldName] = fieldNames;

  if (firstFieldName === undefined) {
    return;
  }

  queueMicrotask(() => {
    const control = form.elements.namedItem(firstFieldName);

    if (control instanceof HTMLElement) {
      control.focus();
      return;
    }

    if (control !== null && "item" in control) {
      const firstControl = control.item(0);

      if (firstControl instanceof HTMLElement) {
        firstControl.focus();
      }
    }
  });
}
