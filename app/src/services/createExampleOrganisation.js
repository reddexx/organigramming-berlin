import { v4 as uuidv4 } from "uuid";
import getURI from "./getURI";

const createExampleOrganisation = ({ name = "Neue Organisation", layout } = {}) => {
  const nextNode = {
    kind: "organisation",
    type: "Team",
    name,
    id: "n" + uuidv4(),
    uri: { uri: getURI("organisation") },
    purpose: "",
    contact: {
      email: "",
      telephone: "",
    },
    address: {
      street: "",
      housenumber: "",
      zipCode: "",
      city: "",
    },
    positions: [
      {
        positionType: "Leitung",
        person: {
          firstName: "",
          lastName: "",
          contact: {
            email: "",
            telephone: "",
          },
        },
      },
    ],
    organisations: [],
  };

  if (layout) {
    nextNode.layout = layout;
  }

  return nextNode;
};

export default createExampleOrganisation;