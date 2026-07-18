import React, { forwardRef } from "react";

export const DecimalInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  (props, ref) => {
    const { onBlur, step = "0.01", ...rest } = props;

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (e.target.value) {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          const formatted = val.toFixed(2);
          if (formatted !== e.target.value) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(e.target, formatted);
              e.target.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }
        }
      }
      if (onBlur) onBlur(e);
    };

    return <input ref={ref} type="number" step={step} onBlur={handleBlur} {...rest} />;
  }
);
DecimalInput.displayName = "DecimalInput";
