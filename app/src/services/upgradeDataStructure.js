import initDocument from "../data/initDocument";
import getURI from "./getURI";
import { sanitizeCustomFonts } from "./customFonts";

const CONNECTOR_ANCHOR_SIDES = ["top", "right", "bottom", "left"];
const CONNECTOR_LINE_STYLES = ["solid", "dashed", "dotted"];
const DEFAULT_CONNECTOR_COLOR = "#6c757d";
const DEFAULT_CONNECTOR_LINE_STYLE = "solid";

function sanitizeFreeConnections(document = {}, validNodeIds = new Set()) {
  const freeConnections = Array.isArray(document.freeConnections)
    ? document.freeConnections
    : [];

  document.freeConnections = freeConnections
    .filter((connection) => {
      return Boolean(
        connection?.id &&
          connection?.sourceNodeId &&
          connection?.targetNodeId &&
          connection.sourceNodeId !== connection.targetNodeId &&
          validNodeIds.has(connection.sourceNodeId) &&
          validNodeIds.has(connection.targetNodeId) &&
          CONNECTOR_ANCHOR_SIDES.includes(connection.sourceAnchor) &&
          CONNECTOR_ANCHOR_SIDES.includes(connection.targetAnchor)
      );
    })
    .map((connection) => ({
      ...connection,
      color:
        typeof connection.color === "string" && connection.color
          ? connection.color
          : DEFAULT_CONNECTOR_COLOR,
      lineStyle: CONNECTOR_LINE_STYLES.includes(connection.lineStyle)
        ? connection.lineStyle
        : DEFAULT_CONNECTOR_LINE_STYLE,
      sourceArrow: connection.sourceArrow === true,
      targetArrow: connection.targetArrow === true,
    }));
}

function collectOrganisationIds(data, ids = new Set()) {
  data.organisations?.forEach((org) => {
    if (org?.id) {
      ids.add(org.id);
    }

    collectOrganisationIds(org, ids);
  });

  return ids;
}

function addUrisToOrgsAndEmployees(data) {
  data.organisations?.forEach((org) => {
    // add an URI to all orgs
    if (!org.uri && !org.uri?.uri) {
      org.uri = { uri: getURI("organisation") };
    }

    // add an URI to all employees
    org.employees?.forEach((employee) => {
      if (!employee.uri && !employee.uri?.uri) {
        employee.uri = { uri: getURI("person") };
      }
    });

    // add an URI to all positions
    org.positions?.forEach((position) => {
      if (!position.uri && !position.uri?.uri) {
        position.uri = { uri: getURI("position") };
      }
      if (!position?.person?.uri && !position.person?.uri?.uri) {
        position.person.uri = { uri: getURI("person") };
      }
    });

    // add an URI to all departments
    org.departments?.forEach((department) => {
      if (!department.uri && !department.uri?.uri) {
        department.uri = { uri: getURI("organisation") };
      }
      // add an URI to all employees of departments
      department.employees?.forEach((employee) => {
        if (!employee.uri && !employee.uri?.uri) {
          employee.uri = { uri: getURI("person") };
        }
      });

      department.positions?.forEach((position) => {
        if (!position.uri && !position.uri?.uri) {
          position.uri = { uri: getURI("position") };
        }
        if (!position?.person?.uri && !position.person?.uri?.uri) {
          position.person.uri = { uri: getURI("person") };
        }
      });
    });

    addUrisToOrgsAndEmployees(org);
  });
}

function toSameAsArray(d) {
  if (!d.uriSameAs) {
    return {
      uri: d.uri || "",
    };
  }

  return {
    uri: d.uri || "",
    sameAsUris: [
      {
        uriSameAs: d.uriSameAs || "",
        uriSameAsLabel: d.uriSameAsLabel || "",
        uriSameAsDescription: d.uriSameAsDescription || "",
      },
    ],
  };
}

function moveSameAsToArray(data) {
  data.organisations?.forEach((org) => {
    if (org.uri?.uriSameAs !== undefined) {
      org.uri = toSameAsArray(org.uri);
    }

    org.employees?.forEach((employee) => {
      if (employee.uri?.uriSameAs !== undefined) {
        employee.uri = toSameAsArray(employee.uri);
      }
    });

    // add an URI to all positions
    org.positions?.forEach((position) => {
      if (position?.uri?.uriSameAs !== undefined) {
        position.uri = toSameAsArray(position.uri);
      }
      if (position.person?.uri?.uriSameAs !== undefined) {
        position.person.uri = toSameAsArray(position.person.uri);
      }
    });

    org.departments?.forEach((department) => {
      if (department?.uri?.uriSameAs !== undefined) {
        department.uri = toSameAsArray(department.uri);
      }

      department.employees?.forEach((employee) => {
        if (employee.uri?.uriSameAs !== undefined) {
          employee.uri = toSameAsArray(employee.uri);
        }
      });

      department.positions?.forEach((position) => {
        if (position.uri?.uriSameAs !== undefined) {
          position.uri = toSameAsArray(position.uri);
        }

        if (position.person?.uri?.uriSameAs !== undefined) {
          position.person.uri = toSameAsArray(position.person.uri);
        }
      });
    });

    moveSameAsToArray(org);
  });
}

function addNewPropsToOrgs(data) {
  data.organisations?.forEach((org) => {
    // add an URI to all orgs
    if (org.isMainOrganisation === undefined) {
      org.isMainOrganisation = false;
    }

    if (org.purpose === undefined) {
      org.purpose = "";
    }

    if (!org.layout) {
      org.layout = {};
    }

    if (org.layout.nodeWidth === undefined) {
      org.layout.nodeWidth = 224;
    }

    if (org.layout.nodeMinHeight === undefined) {
      org.layout.nodeMinHeight = 0;
    }

    if (org.layout.positionMode === undefined) {
      org.layout.positionMode = "auto";
    }

    if (org.layout.x === undefined) {
      org.layout.x = 0;
    }

    if (org.layout.y === undefined) {
      org.layout.y = 0;
    }

    if (!CONNECTOR_ANCHOR_SIDES.includes(org.layout.connectorParentAnchor)) {
      delete org.layout.connectorParentAnchor;
    }

    if (!CONNECTOR_ANCHOR_SIDES.includes(org.layout.connectorChildAnchor)) {
      delete org.layout.connectorChildAnchor;
    }

    if (typeof org.layout.connectorHidden !== "boolean") {
      org.layout.connectorHidden = false;
    }

    if (typeof org.layout.connectorColor !== "string" || !org.layout.connectorColor) {
      org.layout.connectorColor = DEFAULT_CONNECTOR_COLOR;
    }

    if (!CONNECTOR_LINE_STYLES.includes(org.layout.connectorLineStyle)) {
      org.layout.connectorLineStyle = DEFAULT_CONNECTOR_LINE_STYLE;
    }

    if (typeof org.layout.connectorParentArrow !== "boolean") {
      org.layout.connectorParentArrow = false;
    }

    if (typeof org.layout.connectorChildArrow !== "boolean") {
      org.layout.connectorChildArrow = false;
    }

    if (!org?.background && !org?.layout) {
      org.background = {
        color: "",
        style: "default",
      };
    }

    // background has moved to layout.
    // migrate it and delete it
    if (org.background) {
      org.layout = {
        ...org.layout,
        bgColor: org.background.color,
        bgStyle: org.background.style,
      };
      delete org.background;
    }
    // style has moved to layout.
    // migrate it and delete it
    if (org.style) {
      if (!org.layout) {
        org.layout = {};
      }
      org.layout.style = org.style;
      org.layout.grid = "none";

      delete org.style;
    }

    addNewPropsToOrgs(org);
  });
}

function migrateEmployeesToPositionLogic(data) {
  function eachEmployee(employees, orgOrDepartment) {
    // if there are employees
    if (employees) {
      orgOrDepartment.positions = [];
    } else {
      return;
    }
    employees?.forEach((employee) => {
      const employeePosition = employee.position;
      delete employee.position;
      orgOrDepartment.positions.push({
        ...(employeePosition && { positionType: employeePosition }),
        // position is new so a URI is added
        uri: { uri: getURI("position") },
        // "positionStatus" is a new attribute. it i therefor not migrated
        person: employee,
      });
    });
  }

  data.organisations?.forEach((org) => {
    eachEmployee(org.employees, org);
    delete org.employees;
    org.departments?.forEach((department) => {
      eachEmployee(department.employees, department);
      delete department.employees;
    });
    migrateEmployeesToPositionLogic(org);
  });
}

// this functions adds new properties to the imported data if its missing.
// e.g. the uri property has been added later to the tool
export const upgradeDataStructure = (data) => {
  // add meta data id not added yet
  if (!data.meta) {
    data.meta = initDocument.meta;
  }
  // add uri to document if not there
  if (!data.document?.uri) {
    data.document.uri = { uri: getURI("organigram") };
  }

  if (data.document?.isMainChart === undefined) {
    data.document.isMainChart = false;
  }

  if (data.document?.layoutMode === undefined) {
    data.document.layoutMode = "tree";
  }

  if (data.document?.paperBackgroundColor === undefined) {
    data.document.paperBackgroundColor = "#f8f9fa";
  }

  if (!data.settings) {
    data.settings = {};
  }

  if (!Array.isArray(data.settings.roleOptions)) {
    data.settings.roleOptions = [];
  }

  if (!Array.isArray(data.settings.departmentOptions)) {
    data.settings.departmentOptions = [];
  }

  if (!Array.isArray(data.settings.additionalDesignationOptions)) {
    data.settings.additionalDesignationOptions = [];
  }

  data.settings.customFonts = sanitizeCustomFonts(data.settings.customFonts);

  // if doc has prop uriSameAs -> move it to sameAsUris
  if (data.document.uri.uriSameAs !== undefined) {
    data.document.uri = toSameAsArray(data.document.uri);
  }

  // add new props to orgs if missing
  addNewPropsToOrgs(data);

  // traverse all orgs and add uris to orgs and employees
  addUrisToOrgsAndEmployees(data);

  // traverse all orgs and employees and move prop uriSameAs ->  to sameAsUris
  moveSameAsToArray(data);

  // rearrange data to move employees to position.person logic
  migrateEmployeesToPositionLogic(data);

  if (!Array.isArray(data.document.freeConnections)) {
    data.document.freeConnections = [];
  }
  sanitizeFreeConnections(data.document, collectOrganisationIds(data));

  return data;
};
