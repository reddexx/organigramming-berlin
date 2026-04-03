import { v4 as uuidv4 } from "uuid";
import getURI from "./getURI";

const createNoteNode = ({ name = "Notiz", layout } = {}) => ({
  kind: "note",
  name,
  type: "",
  id: "n" + uuidv4(),
  uri: { uri: getURI("organisation") },
  noteText: "Neue Notiz",
  organisations: [],
  layout: {
    style: "default",
    bgColor: "",
    borderColor: "",
    borderWidth: 0,
    borderRadius: 0,
    ...(layout || {}),
  },
});

export default createNoteNode;