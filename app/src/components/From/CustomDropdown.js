import React, { useMemo, useRef } from "react";

const normalizeOptions = (options = []) => {
  return [...new Set(options.filter((option) => typeof option === "string" && option.trim()))];
};

const CustomDropdown = (props) => {
  const { idSchema, formData, onChange, schema = {}, placeholder, disabled, readonly } = props;
  const inputId = idSchema?.$id;
  const dataListId = inputId ? `${inputId}__options` : undefined;
  const inputRef = useRef(null);
  const options = useMemo(() => {
    const schemaEnum = Array.isArray(schema.enum) ? schema.enum : [];
    const schemaExamples = Array.isArray(schema.examples) ? schema.examples : [];
    return normalizeOptions([...schemaEnum, ...schemaExamples]);
  }, [schema.enum, schema.examples]);

  const openOptions = () => {
    const inputElement = inputRef.current;

    if (!inputElement || disabled || readonly) {
      return;
    }

    inputElement.focus();

    if (typeof inputElement.showPicker === "function") {
      try {
        inputElement.showPicker();
      } catch (error) {
        // Some browsers do not allow programmatic opening for text+datalist inputs.
      }
    }
  };

  return (
    <div className="customDropdown">
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        className="form-control"
        value={formData || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        list={options.length > 0 ? dataListId : undefined}
        disabled={disabled || readonly}
        autoComplete="off"
      />
      <button
        type="button"
        className="customDropdown-toggle"
        onMouseDown={(event) => event.preventDefault()}
        onClick={openOptions}
        disabled={disabled || readonly || options.length === 0}
        tabIndex={-1}
        aria-label="Optionen anzeigen"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          fill="currentColor"
          className="bi bi-chevron-down me-1"
          viewBox="0 0 16 16"
        >
          <path
            fillRule="evenodd"
            d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"
          />
        </svg>
      </button>
      {options.length > 0 && (
        <datalist id={dataListId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </div>
  );
};
export default CustomDropdown;
