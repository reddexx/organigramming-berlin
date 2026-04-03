import { v4 as uuidv4 } from "uuid";
import getURI from "./getURI";

const createExampleOrganisation = ({ name = "Neue Organisation", layout } = {}) => {
  const nextNode = {
    kind: "organisation",
    type: "Team",
    name,
    id: "n" + uuidv4(),
    uri: { uri: getURI("organisation") },
    purpose: "Beispielinhalt eintragen",
    contact: {
      email: "team@beispiel.de",
      telephone: "+49 30 1234567",
    },
    address: {
      street: "Beispielstrasse",
      housenumber: "1",
      zipCode: "10115",
      city: "Berlin",
    },
    positions: [
      {
        positionType: "Leitung",
        person: {
          firstName: "Max",
          lastName: "Mustermann",
          contact: {
            email: "max.mustermann@beispiel.de",
            telephone: "+49 30 1234568",
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