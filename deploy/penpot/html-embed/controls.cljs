;; MPL-2.0. Native Penpot controls for canvas HTML embeds.
(ns app.main.ui.workspace.html-embed-controls
  (:require-macros [app.main.style :as stl])
  (:require
   [app.main.ui.components.dropdown-menu :refer [dropdown-menu* dropdown-menu-item*]]
   [app.main.ui.components.title-bar :refer [title-bar*]]
   [app.main.ui.ds.buttons.button :refer [button*]]
   [app.main.ui.ds.buttons.icon-button :refer [icon-button*]]
   [app.main.ui.ds.foundations.assets.icon :as i]
   [rumext.v2 :as mf]))

(defn request! [action id]
  (.dispatchEvent js/window (js/CustomEvent. "xenica-html-command"
                                             #js {:detail #js {:action action :id (when id (str id))}})))

(mf/defc tools*
  [{:keys [item-class menu-class menu-item-class]}]
  (let [open* (mf/use-state false)
        pinned* (mf/use-state #(= "true" (.getItem js/localStorage "penpot-html-tool-pinned")))
        close #(reset! open* false)]
    [:*
     (when @pinned*
       [:li {:class item-class}
        [:> icon-button* {:variant "ghost" :icon i/code :aria-label "嵌入 HTML"
                          :tooltip-placement "bottom" :on-click #(request! "insert" nil)}]])
     [:li {:class item-class}
      [:> icon-button* {:variant "ghost" :icon i/menu :aria-label "更多工具"
                        :tooltip-placement "bottom" :aria-expanded @open*
                        :on-click (fn [event] (.stopPropagation event) (swap! open* not))}]
      [:> dropdown-menu* {:show @open* :on-close close :class (str menu-class " " (stl/css :tools-menu))}
       [:> dropdown-menu-item* {:class menu-item-class :on-click #(request! "insert" nil)} "嵌入 HTML"]
       [:> dropdown-menu-item* {:class menu-item-class
                                :on-click #(let [value (not @pinned*)]
                                             (reset! pinned* value)
                                             (.setItem js/localStorage "penpot-html-tool-pinned" (str value)))}
        (if @pinned* "从工具栏移除 HTML" "将 HTML 固定到工具栏")]]]]))

(mf/defc panel*
  [{:keys [selected objects]}]
  (let [shape (when (= 1 (count selected)) (get objects (first selected)))
        frame? (= :frame (:type shape))
        embedded? #(get-in % [:plugin-data :shared/xenica-html-embed "html"])
        child (when frame? (some #(when (embedded? %) %) (map objects (:shapes shape))))
        chosen (if (embedded? shape) shape child)
        status* (mf/use-state nil)
        active? (= (str (:id chosen)) @status*)]
    (mf/with-effect []
      (let [listener #(reset! status* (.. % -detail -active))]
        (.addEventListener js/window "xenica-html-status" listener)
        #(.removeEventListener js/window "xenica-html-status" listener)))
    (when (or frame? chosen)
      [:section {:class (stl/css :panel) :aria-label "HTML 嵌入"}
       [:> title-bar* {:title "HTML 嵌入"}]
       [:div {:class (stl/css :actions)}
        (when frame?
          [:> button* {:variant "secondary" :icon i/code :on-click #(request! "insert" (:id shape))}
           "在此 Board 插入 HTML"])
        (when chosen
          [:*
           [:> button* {:variant (if active? "primary" "secondary")
                        :on-click #(request! (if active? "exit" "enter") (:id chosen))}
            (if active? "返回画布" "进入交互")]
           [:> button* {:variant "secondary" :on-click #(request! "edit" (:id chosen))} "编辑 HTML"]
           (when (:frame-id chosen)
             [:> button* {:variant "ghost" :on-click #(request! "fit" (:id chosen))} "适配 Board"])
           (when (not frame?)
             [:> button* {:variant "ghost" :on-click #(request! "select-board" (:id chosen))} "选择所属 Board"])
           [:p {:class (stl/css :hint)} "双击内容进入交互 · Esc 返回画布"]])]])))
