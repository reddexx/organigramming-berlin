import orgChart from "../schemas/organization_chart";
import typeVocabLookup from "./typeVocabLookup";

const mergeUniqueSorted = (...groups) => {
  return [...new Set(groups.flat().filter((item) => typeof item === "string" && item.trim()))].sort(
    (left, right) => left.localeCompare(right, "de")
  );
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

  definitions.definitions.organisation.properties.type.examples = mergeUniqueSorted(
    orgs,
    customDepartments
  );
  definitions.definitions.department.properties.type.examples = mergeUniqueSorted(
    orgs,
    customDepartments
  );
  definitions.definitions.organisation.properties.purpose.examples = mergeUniqueSorted(
    customAdditionalDesignations
  );
  definitions.definitions.department.properties.purpose.examples = mergeUniqueSorted(
    customAdditionalDesignations
  );
  definitions.definitions.position.properties.positionType.examples = mergeUniqueSorted(
    persons,
    customRoles
  );
  definitions.definitions.position.properties.positionStatus.examples = mergeUniqueSorted(
    positionStatus,
    customAdditionalDesignations
  );

  return definitions;
}
