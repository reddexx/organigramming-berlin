import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Button } from "react-bootstrap";

import PropTypes from "prop-types";
import {
  dragNodeService,
  selectNodeService,
} from "../../services/service";
import "./ChartNode.scss";
import ChartNodeCard from "./ChartNodeCard";

const propTypes = {
  props: PropTypes.object,
  data: PropTypes.object,
  draggable: PropTypes.bool,
  collapsible: PropTypes.bool,
  multipleSelect: PropTypes.bool,
  changeHierarchy: PropTypes.func,
  onClickNode: PropTypes.func,
  onContextMenu: PropTypes.func,
  onDragNode: PropTypes.func,
  onAddInitNode: PropTypes.func,
  contentEditable: PropTypes.bool,
};

const defaultProps = {
  draggable: false,
  collapsible: true,
  multipleSelect: true,
  contentEditable: true,
};

const ChartNode = forwardRef(
  (
    {
      data,
      draggable,
      collapsible,
      multipleSelect,
      changeHierarchy,
      onClickNode,
      onContextMenu,
      onDragNode,
      level,
      onAddInitNode,
      contentEditable,
    },
    ref
  ) => {
    const node = useRef();
    const innerRef = useRef();
    const [allowedDrop, setAllowedDrop] = useState(false);
    const [selected, setSelected] = useState(false);
    const [ds, setDs] = useState(data);

    useImperativeHandle(ref, () => ({
      demoDragMode: (enable, nodeId = "") => {
        if (enable) {
          filterAllowedDropNodes(nodeId);
          document.body.classList.add("drag-demo");
        } else {
          dragNodeService.clearDragInfo();
          document.body.classList.remove("drag-demo");
          onDragNode(false);
        }
      },
      innerRef: innerRef.current,
    }));

    useEffect(() => {
      setDs(data);
    }, [data]);

    useEffect(() => {
      const subs1 = dragNodeService.getDragInfo().subscribe((draggedInfo) => {
        if (draggedInfo) {
          setAllowedDrop(
            !document
              .querySelector("#" + draggedInfo.draggedNodeId)
              .closest("li")
              .querySelector("#" + node.current.id)
              ? true
              : node.current.id === "n-root"
              ? true
              : false
          );
        } else {
          setAllowedDrop(false);
        }
      });

      const subs2 = selectNodeService
        .getSelectedNodeInfo()
        .subscribe((selectedNodeInfo) => {
          if (selectedNodeInfo) {
            if (multipleSelect) {
              if (selectedNodeInfo.selectedNodeId === data.id) {
                setSelected(true);
              }
            } else {
              setSelected(selectedNodeInfo.selectedNodeId === data.id);
            }
          } else {
            setSelected(false);
          }
        });

      return () => {
        subs1.unsubscribe();
        subs2.unsubscribe();
      };
    }, [multipleSelect, data.id]);

    const filterAllowedDropNodes = (id) => {
      dragNodeService.sendDragInfo(id);
    };

    const clickNodeHandler = (event) => {
      if (onClickNode) {
        onClickNode(ds);
      }
      if (contentEditable) {
        selectNodeService.sendSelectedNodeInfo(ds.id);
      }
    };

    const dragStartHandler = (event) => {
      const copyDS = { ...ds };
      onDragNode(true);
      delete copyDS.relationship;
      event.dataTransfer.setData("text/plain", JSON.stringify(copyDS));
      // highlight all potential drop targets
      filterAllowedDropNodes(node.current.id);
    };

    const dragOverHandler = (event) => {
      // prevent default to allow drop
      event.preventDefault();
    };

    const dragendHandler = () => {
      // reset background of all potential drop targets
      dragNodeService.clearDragInfo();
      onDragNode(false);
    };

    const dropHandler = (event) => {
      onDragNode(false);
      if (!event.currentTarget.classList.contains("allowedDrop")) {
        return;
      }
      dragNodeService.clearDragInfo();
      changeHierarchy(
        JSON.parse(event.dataTransfer.getData("text/plain")),
        event.currentTarget.id
      );
    };

    const contextMenuHandler = (e) => {
      e.preventDefault();
      if (onClickNode) {
        onClickNode(ds);
      }
      selectNodeService.sendSelectedNodeInfo(ds.id);
      onContextMenu(e);
    };

    return (
      <li className={"oc-hierarchy level-" + level}>
        <div
          id={ds.id}
          ref={node}
          className={
            "oc-node " +
            (allowedDrop ? " allowedDrop" : "") +
            (selected ? " selected" : "") +
            (ds.layout?.style ? " " + ds.layout?.style : "") +
            (ds.organisations && ds.organisations.length > 0
              ? ds.organisations.length > 1
                ? " has-children"
                : " has-child"
              : " end-node")
          }
          draggable={ds.layout?.style !== "root" && draggable ? true : false}
          onClick={ds.layout?.style !== "root" ? clickNodeHandler : null}
          onDragStart={ds.layout?.style !== "root" && draggable ? dragStartHandler : null}
          onDragOver={dragOverHandler}
          onDragEnd={draggable ? dragendHandler : null}
          onDrop={dropHandler}
          onContextMenu={
            ds.layout?.style !== "root" ? contextMenuHandler : null
          }
        >
          <ChartNodeCard data={ds} />
        </div>
        {ds.organisations && ds.organisations.length > 0 ? (
          // <Droppable
          //   droppableId={"organisation-" + ds.id}
          //   type={"organisation"}
          // >
          //   {(provided, snapshot) => (
          <ul
            className={
              "sub-organisations " +
              (ds.suborganizationOrientation
                ? ds.suborganizationOrientation
                : "horizontal")
            }
            // style={getListStyle(snapshot.isDraggingOver)}
            // {...provided.droppableProps}
            // ref={provided.innerRef}
            // ref={(e) => {
            //   console.log("Droppable", e);
            //   provided.innerRef(e);
            // }}
          >
            {ds.organisations.map((node, index) => (
              <ChartNode
                index={index}
                data={node}
                level={level + 1}
                id={node.id}
                key={node.id}
                draggable={draggable}
                collapsible={collapsible}
                multipleSelect={multipleSelect}
                changeHierarchy={changeHierarchy}
                onClickNode={onClickNode}
                onContextMenu={onContextMenu}
                onDragNode={onDragNode}
              />
            ))}
            {/* {provided.placeholder} */}
          </ul>
        ) : (
          //   )}
          // </Droppable>
          ""
          // <Droppable
          //   droppableId={"organisation-" + ds.id}
          //   type={"organisation"}
          // >
          //   {(provided, snapshot) => (
          //     <ul
          //       className={
          //         "sub-organisations " +
          //         (ds.suborganizationOrientation
          //           ? ds.suborganizationOrientation
          //           : "horizontal")
          //       }
          //       style={getListStyle(snapshot.isDraggingOver)}
          //       {...provided.droppableProps}
          //       ref={provided.innerRef}
          //     >
          //       <li>Hier</li>
          //       {provided.placeholder}
          //     </ul>
          //   )}
          // </Droppable>
        )}

        {ds.organisations &&
          ds.organisations.length < 1 &&
          ds.layout?.style === "root" && (
            <Button variant="outline-success" onClick={() => onAddInitNode()}>
              Neue Organisation anlegen
            </Button>
          )}
      </li>
      //   ))}
      // </Draggable>
    );
  }
);

ChartNode.propTypes = propTypes;
ChartNode.defaultProps = defaultProps;

export default ChartNode;
