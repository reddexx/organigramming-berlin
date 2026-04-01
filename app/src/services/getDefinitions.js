import orgChart from "../schemas/organization_chart";
import typeVocabLookup from "./typeVocabLookup";
import { getCustomFontOptions } from "./customFonts";

const normalizeOptions = (options = []) => {
  return [...new Set(options.filter((item) => typeof item === "string" && item.trim()))];
};

const sortOptions = (options = []) => {
  return [...options].sort((left, right) => left.localeCompare(right, "de"));
};

const mergeWithCustomFirst = (customOptions = [], defaultOptions = []) => {
  const normalizedCustomOptions = normalizeOptions(customOptions);
  const normalizedDefaultOptions = normalizeOptions(defaultOptions).filter(
    (option) => !normalizedCustomOptions.includes(option)
  );

  return [...sortOptions(normalizedCustomOptions), ...sortOptions(normalizedDefaultOptions)];
};

export function getDefinitions(data = null) {
  const definitions = JSON.parse(JSON.stringify(orgChart));
  let orgs = [];
  let persons = [];
  let positionStatus = [];

  Object.keys(typeVocabLookup).forEach((type) => {
    if (typeVocabLookup[type].type === "org") {
      orgs.push(type);
    }
    if (typeVocabLookup[type].type === "position") {
      persons.push(type);
    }
    if (typeVocabLookup[type].type === "positionStatus") {
      positionStatus.push(type);
    }
  });

  const customRoles = data?.settings?.roleOptions || [];
  const customDepartments = data?.settings?.departmentOptions || [];
  const customAdditionalDesignations = data?.settings?.additionalDesignationOptions || [];
  const customFontOptions = getCustomFontOptions(data?.settings?.customFonts || []);

  const appendCustomFontOptions = (schemaNode) => {
    customFontOptions.forEach((fontOption) => {
      if (!schemaNode.enum.includes(fontOption.value)) {
        schemaNode.enum.push(fontOption.value);
        schemaNode.enumNames.push(fontOption.label);
      }
    });
  };

  definitions.definitions.organisation.properties.type.examples = mergeWithCustomFirst(
    customDepartments,
    orgs
  );
  definitions.definitions.department.properties.type.examples = mergeWithCustomFirst(
    customDepartments,
    orgs
  );
  definitions.definitions.organisation.properties.purpose.examples = mergeWithCustomFirst(
    customAdditionalDesignations
  );
  definitions.definitions.department.properties.purpose.examples = mergeWithCustomFirst(
    customAdditionalDesignations
  );
  definitions.definitions.position.properties.positionType.examples = mergeWithCustomFirst(
    customRoles,
    persons
  );
  definitions.definitions.position.properties.positionStatus.examples = mergeWithCustomFirst(
    customAdditionalDesignations,
    positionStatus
  );

  appendCustomFontOptions(definitions.definitions.document.properties.titleFontFamily);
  appendCustomFontOptions(
    definitions.definitions.organisation.properties.layout.properties.headingFontFamily
  );
  appendCustomFontOptions(
    definitions.definitions.organisation.properties.layout.properties.contentFontFamily
  );
  appendCustomFontOptions(
    definitions.definitions.organisation.properties.layout.properties.personFontFamily
  );

  return definitions;
}
