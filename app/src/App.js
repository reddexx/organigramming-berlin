import "./global.scss";
import Joyride, { ACTIONS, EVENTS, STATUS } from "react-joyride";
import { DragDropContext } from "react-beautiful-dnd";
import { useMount, useSetState } from "react-use";
import { Container, Alert } from "react-bootstrap";
import React, { useState, useRef, useEffect } from "react";
import useUndo from "use-undo";
import { fromEvent } from "file-selector";

import AlertModal from "./components/Sidebar/AlertModal";
import AuthModal from "./components/Sidebar/AuthModal";
import Chart from "./components/Chart/Chart";
import Sidebar from "./components/Sidebar/Sidebar";
import initDocument from "./data/initDocument";
import {
  toSnakeCase,
  handleDropEnd,
  isDefiend,
  validateData,
  getFileNameFromURL,
  removePersonProps
} from "./services/service";
import { upgradeDataStructure } from "./services/upgradeDataStructure";
import { getDataURL } from "./services/getDataURL";
import { getExternalData } from "./services/getExternalData";

import JSONDigger from "./services/jsonDigger";
import { getJoyrideSettings } from "./lib/getJoyrideSettings";

const initdata = () => {
  let doc = initDocument;

  if (localStorage.getItem("data") !== null) {
    try {
      return JSON.parse(localStorage.getItem("data"));
    } catch (error) {
      localStorage.setItem("data", "");
      doc = upgradeDataStructure(doc);
      return doc;
    }
  } else {
    doc = upgradeDataStructure(doc);
    return doc;
  }
};

const normalizeMainCharts = (charts = [], preferredId) => {
  const activeMainId =
    preferredId ||
    (charts || []).find(
      (chart) => chart.isMainChart || chart?.data?.document?.isMainChart
    )?.id ||
    null;

  return (charts || []).map((chart) => {
    const isMain = activeMainId ? chart.id === activeMainId : false;
    return {
      ...chart,
      isMainChart: isMain,
      data: chart.data
        ? {
            ...chart.data,
            document: {
              ...(chart.data.document || {}),
              isMainChart: isMain,
            },
          }
        : chart.data,
    };
  });
};

const App = () => {
  const chart = useRef();
  const controlLayer = useRef();
  const [selected, setSelected] = useState(null);
  const [data, setData] = useState(initdata());
  const [tempData, setTempData] = useState();
  const [droppedData, setDroppedData] = useState();
  const [dataURL, setDataURL] = useState(null);
  const [mode, setMode] = useState("viewer"); // "admin" or "viewer"
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem("isAuthenticated") === "1"
  );
  const [authModalShow, setAuthModalShow] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [sharedCharts, setSharedCharts] = useState([]);
  const [currentSharedChartId, setCurrentSharedChartId] = useState(null);

  const [importError, setImportError] = useState(null);
  const [dataUrlError, setDataUrlError] = useState(null);

  const [closeNewDocumentModal, setCloseNewDocumentModal] = useState(0);

  const dsDigger = new JSONDigger(data, "id", "organisations");

  const [{ run, stepIndex, steps }, setState] = useSetState({
    run: false,
    stepIndex: 0,
    steps: [],
  });

  const [
    dataState,
    {
      set: setUndoData,
      // reset: resetData,
      undo: setUndo,
      redo: setRedo,
      canUndo,

      const normalizeMainCharts = (charts = [], preferredId) => {
        const activeMainId =
  const { present: undoData } = dataState;
  const effectiveMode = isAuthenticated ? "admin" : mode;
                  const updated = current.map((item) => {
                    if (item.id === saved.id) return saved;
                    return item;

        localStorage.setItem("data", JSON.stringify(e));
        setCloseNewDocumentModal((prev) => prev + 1);
      } else {
        console.error(errors);
              const charts = normalizeMainCharts(list || []);
    }
  };

  const handleKeyDown = (e) => {
    let charCode = String.fromCharCode(e.which).toLowerCase();
    if ((e.ctrlKey || e.metaKey) && charCode === "z") {
      if (e.shiftKey) {
        setRedo();
      } else {
        setUndo();
      }
    }
  };

  const handleJoyrideStart = () => {
    setTempData({ ...data });
    setData(initDocument);
    setState({ run: true, stepIndex: 0 });
  };

  const onSave = async (includeLogo = true, excludePersonalData = false) => {
    const dataCopy = excludePersonalData ? removePersonProps(data) : data;
    const fileName = dataCopy.export.filename || toSnakeCase(dataCopy.document.title);
    const exportData = includeLogo
      ? { ...dataCopy }
      : { ...dataCopy, document: { ...dataCopy.document, logo: "" } };
    const json = JSON.stringify(exportData);
    const blob = new Blob([json], { type: "application/json" });
    const href = await URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = fileName + ".json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportTo = (fileextension, includeLogo = true, pdfType = "") => {
    const fileName = data.export.filename || toSnakeCase(data.document.title);

    chart.current.exportTo(fileName, fileextension, includeLogo, data, pdfType);
  };

  useMount(() => {
    setState(getJoyrideSettings(controlLayer));
  });

  const handleJoyrideCallback = (jRData) => {
    const { action, index, status, type } = jRData;

    if (action === "close") {
      setState({ run: false, stepIndex: 0 });
      return;
    }

    if ([EVENTS.STEP_AFTER, EVENTS.TARGET_NOT_FOUND].includes(type)) {
      // Update state to advance the tour
      const stepIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      setState({ stepIndex: stepIndex });
      chart.current.orgchart.demoDragMode(false);
      chart.current.demoContexMenu(false, "n3");
      chart.current.resetViewHandler();
      setSelected(null);
      if (stepIndex === 2) {
        setSelected("document");
      } else if (stepIndex > 3 && stepIndex < 9) {
        setSelected(data.organisations[0]);
        if (stepIndex === 8) {
          function selectElementUntilExists(elementId) {
            const element = document.getElementById(elementId);
            if (element) {
              element.scrollIntoView();
              setState({ stepIndex: stepIndex });
            } else {
              setTimeout(function () {
                selectElementUntilExists(elementId);
              }, 30);
            }
          }

          selectElementUntilExists("organisation-tab");
        }
      } else if (stepIndex === 9) {
        chart.current.orgchart.demoDragMode(true, "n6");
      } else if (stepIndex === 10) {
        chart.current.demoContexMenu(true, "n3");
      }
    } else if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      // Need to set our running state to false, so we can restart if we click start again.
      setData({ ...tempData });
      setState({ run: false });
      setSelected(null);
      chart.current.demoContexMenu(false, "n3");
      chart.current.orgchart.demoDragMode(false);
    }
  };

  const onDragEnd = async (e) => {
    if (e.type !== "organisation") {
      let _data = await handleDropEnd(e, dsDigger);
      onChange(_data);
      setSelected(await dsDigger.findNodeById(selected.id));
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const draggedFiles = await fromEvent(e);

    if (!draggedFiles[0]) {
      return;
    }

    const reader = new FileReader();
    if (draggedFiles[0].type && draggedFiles[0].type !== "application/json") {
      setImportError(["Keine valide JSON Datei"]);
      return;
    }
    reader.readAsText(draggedFiles[0]);
    reader.onload = () => {
      let result = reader.result;
      try {
        JSON.parse(result);
      } catch (e) {
        setImportError(["Keine valide JSON Datei"]);
        return;
      }
      result = JSON.parse(result);
      result = upgradeDataStructure(result);
      const [valid, errors] = validateData(result);

      if (!valid) {
        setImportError(errors);
        return;
      } else {
        setDroppedData(result);
      }
    };
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    const { error, url } = getDataURL();
    if (error) {
      setDataUrlError(error);
      return;
    }
    setDataURL(url);
  }, []);

  // Read runtime config generated by the container (env.json)
  useEffect(() => {
    const loadRuntimeConfig = async () => {
      try {
        const res = await fetch("/env.json", { cache: "no-store" });
        if (!res.ok) return;
        const cfg = await res.json();
        if (cfg) {
          if (cfg.mode === "admin" || cfg.mode === "viewer") setMode(cfg.mode);
          if (cfg.adminPassword) setAdminPassword(cfg.adminPassword);
        }
      } catch (e) {
        // ignore - fallback to default
      }
    };
    loadRuntimeConfig();
  }, []);

  const login = () => {
    setIsAuthenticated(true);
    localStorage.setItem("isAuthenticated", "1");
    setAuthModalShow(false);
  };
  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem("isAuthenticated");
  };

  const showLoginModal = () => setAuthModalShow(true);

  const getSharedCharts = () => {
    return sharedCharts;
  };

  const publishCurrentChart = (options = {}) => {
    const title = data?.document?.title || "Untitled";
    const overwrite = Boolean(options.overwrite && currentSharedChartId);
    const payload = {
      title,
      meta: options.meta || {},
      data,
      isMainChart: data?.document?.isMainChart === true,
      ...(overwrite ? { id: currentSharedChartId, overwrite: true } : {}),
    };
    return fetch('/api/charts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((saved) => {
        setSharedCharts((prev) => {
          const current = prev || [];
          if (overwrite) {
            const updated = current.map((item) => {
              if (item.id === saved.id) return saved;
              return item;
            });
            return normalizeMainCharts(
              updated,
              saved.isMainChart ? saved.id : undefined
            );
          }
          return normalizeMainCharts(
            [saved, ...current],
            saved.isMainChart ? saved.id : undefined
          );
        });
        setCurrentSharedChartId(saved.id);
        return saved;
      })
      .catch((e) => {
        console.error('publish failed', e);
        return null;
      });
  };

  const loadSharedChart = (id) => {
    const item = sharedCharts.find((s) => s.id === id);
    if (item && item.data) {
      onChange(item.data);
      setCurrentSharedChartId(item.id);
    } else {
      // fallback - reload from server
      fetch('/api/charts')
        .then((r) => r.json())
        .then((list) => {
          const charts = normalizeMainCharts(list || []);
          setSharedCharts(charts);
          const it = charts.find((s) => s.id === id);
          if (it && it.data) onChange(it.data);
          if (it) setCurrentSharedChartId(it.id);
        });
    }
  };

  useEffect(() => {
    // load shared charts from server
    fetch('/api/charts')
      .then((r) => r.json())
      .then((list) => {
        const charts = normalizeMainCharts(list || []);
        setSharedCharts(charts);
        const main = charts.find(
          (s) => s.isMainChart || (s.data && s.data.document && s.data.document.isMainChart)
        );
        if (main && main.data) {
          onChange(main.data);
          setCurrentSharedChartId(main.id);
        }
      })
      .catch(() => setSharedCharts([]));
  }, []);

  const deleteSharedChart = (id) => {
    if (!id) return Promise.resolve(null);
    return fetch(`/api/charts/${id}`, { method: 'DELETE' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Delete failed');
        }
        setSharedCharts((prev) => {
          const remaining = normalizeMainCharts((prev || []).filter((s) => s.id !== id));
          if (currentSharedChartId === id) {
            if (remaining.length > 0) {
              onChange(remaining[0].data);
              setCurrentSharedChartId(remaining[0].id);
            } else {
              setData(initDocument);
              setCurrentSharedChartId(null);
            }
          }
          return remaining;
        });
        return true;
      })
      .catch((e) => {
        console.error('delete failed', e);
        throw e;
      });
  };

  return (
    <div
      className="App"
      onKeyDown={handleKeyDown}
      onDrop={(e) => handleDrop(e)}
      onDragOver={(e) => handleDragOver(e)}
      onDragEnter={(e) => handleDragEnter(e)}
      onDragLeave={(e) => handleDragLeave(e)}
    >
      <Joyride
        callback={handleJoyrideCallback}
        continuous
        run={run}
        scrollToFirstStep
        showProgress
        showSkipButton
        stepIndex={stepIndex}
        steps={steps}
        locale={{
          back: "Zurück",
          close: "Verlassen",
          last: "Ende",
          next: "Weiter",
          skip: "Tour verlassen",
        }}
        styles={{
          options: { primaryColor: "#132458" },
          tooltip: {
            borderRadius: ".2rem",
          },
          tooltipContainer: {
            textAlign: "left",
          },
          tooltipTitle: {
            margin: 0,
          },
          tooltipContent: {
            padding: "1rem 0",
          },
          buttonNext: {
            borderRadius: ".2rem",
            color: "#fff",
          },
          buttonBack: {
            marginRight: ".2rem",
          },
        }}
      />

      <AlertModal
        show={dataURL}
        onHide={() => {
          setDataURL(null);
        }}
        saveButton={"importieren"}
        onSave={async () => {
          const { error, data } = await getExternalData(dataURL);
          console.log(error, data);
          if (error) {
            setImportError(error);
          } else {
            setDataURL(null);
            setData(data);
          }
        }}
        title="Externe Daten importieren"
      >
        Möchten Sie die Datei <b>{getFileNameFromURL(dataURL)}</b> von der
        folgenden Quelle importieren?
        <br></br> <br></br>
        <i>{dataURL}</i>
        <br></br> <br></br>
      </AlertModal>

      <AlertModal
        show={droppedData}
        onHide={() => {
          setDroppedData(null);
        }}
        saveButton={"Importieren"}
        onSave={() => {
          onChange(droppedData);
          setDroppedData(null);
        }}
        title="Dokument importieren"
      >
        Wenn Sie ein neues Dokument öffnen, gehen ungespeicherte Änderungen an
        ihrem aktuellen Dokument verloren.
      </AlertModal>

      <AlertModal
        show={dataUrlError}
        onHide={() => {
          setDataUrlError(null);
        }}
        title="Import Fehlgeschlagen"
      >
        <Alert variant="danger">
          Möchten Sie eine externe URL laden? Sie haben über den Parameter
          "dataurl" in der URL eine externe Quelle angegeben. Diese Quelle ist
          fehlerhaft:
          {dataUrlError?.map((error, i) => (
            <div key={"error-" + i} className="my-2">
              {error}
            </div>
          ))}
          Bitte überprüfen Sie die URL.
        </Alert>
      </AlertModal>

      <AlertModal
        show={importError}
        onHide={() => {
          setImportError(null);
        }}
        title="Import Fehlgeschlagen"
      >
        <Alert variant="danger">
          Beim öffnen der Datei ist ein Fehler aufgetreten:
          {importError?.map((error, i) => (
            <div key={"error-" + i} className="my-2">
              {JSON.stringify(error, null, " ")}
            </div>
          ))}
        </Alert>
      </AlertModal>

      <DragDropContext onDragEnd={onDragEnd}>
        <Container className="control-layer" fluid>
          <Sidebar
            data={data}
            dsDigger={dsDigger}
            sendDataUp={onChange}
            selected={selected}
            setSelected={(e) => setSelected(e)}
            onExport={exportTo}
            onSave={onSave}
            onUndo={setUndo}
            onRedo={setRedo}
            enableUndo={canUndo}
            enableRedo={canRedo}
            onJoyrideStart={handleJoyrideStart}
            ref={controlLayer}
            closeNewDocumentModal={closeNewDocumentModal}
            dataURL={dataURL}
            mode={effectiveMode}
            setMode={(m) => setMode(m)}
            isAuthenticated={isAuthenticated}
            onRequestLogin={showLoginModal}
            onPublish={publishCurrentChart}
            sharedCharts={sharedCharts}
            onLoadSharedChart={loadSharedChart}
            currentSharedChartId={currentSharedChartId}
            onDeleteSharedChart={deleteSharedChart}
            logout={logout}
            adminPassword={adminPassword}
          />
          <AuthModal
            show={authModalShow}
            onHide={() => setAuthModalShow(false)}
            onLogin={login}
            adminPassword={adminPassword}
          />
        </Container>
        <Chart
          ref={chart}
          className="chart-layer"
          data={data}
          sendDataUp={onChange}
          mode={effectiveMode}
          onOpenLinkedChart={effectiveMode === "viewer" ? loadSharedChart : undefined}
          setSelected={(e) => {
            setSelected(e);
          }}
        />
      </DragDropContext>
    </div>
  );
};

export default App;
