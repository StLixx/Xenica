;; This Source Code Form is subject to the terms of the Mozilla Public
;; License, v. 2.0. https://mozilla.org/MPL/2.0/
(ns app.main.ui.workspace.html-embed
  (:require
   [app.common.files.helpers :as cfh]
   [app.common.geom.matrix :as gmt]
   [app.common.geom.point :as gpt]
   [app.common.geom.shapes :as gsh]
   [app.common.types.shape :as cts]
   [app.common.uuid :as uuid]
   [app.main.data.helpers :as dsh]
   [app.main.data.plugins :as dp]
   [app.main.data.workspace.selection :as selection]
   [app.main.data.workspace.shapes :as shapes]
   [app.main.store :as st]
   [app.main.ui.viewer.viewport-common :as vpc]
   [rumext.v2 :as mf]))

(def data-namespace :shared/xenica-html-embed)

(defn embed-data [shape]
  (get-in shape [:plugin-data data-namespace]))

(defn modified-shape [shape modifiers]
  (if-let [m (get modifiers (:id shape))]
    (if-let [geometry (:modifiers m)]
      (gsh/transform-shape shape geometry)
      (gsh/apply-transform shape m))
    shape))

(defn clip-frames [shape objects modifiers]
  (loop [id (:frame-id shape) seen #{} result []]
    (if (or (nil? id) (= id uuid/zero) (contains? seen id))
      result
      (if-let [frame (get objects id)]
        (recur (:frame-id frame) (conj seen id)
               (cond-> result (not (:show-content frame))
                       (conj (select-keys (modified-shape frame modifiers) [:points]))))
        result))))

(defn corner-basis [shape]
  (let [[p0 p1 _ p3] (:points shape)]
    (gmt/matrix (- (:x p1) (:x p0)) (- (:y p1) (:y p0))
                (- (:x p3) (:x p0)) (- (:y p3) (:y p0))
                (:x p0) (:y p0))))

(defn fitted-shape [shape frame]
  (-> (gsh/apply-transform shape (gmt/multiply (corner-basis frame)
                                               (gmt/inverse (corner-basis shape))))
      (assoc :constraints-h :leftright :constraints-v :topbottom)))

(mf/defc layer*
  [{:keys [objects selected vbox zoom file-id page-id modifiers read-only viewer palette-size]}]
  (let [node-ref (mf/use-ref nil)
        entries (->> (vals objects)
                     (filter #(and (not (:hidden %)) (get (embed-data %) "html")))
                     (mapv (fn [original]
                             (let [shape (modified-shape original modifiers)
                                   frame-id (:frame-id original)]
                               {:id (str (:id shape))
                                :frameId (when (and frame-id (not= frame-id uuid/zero)) (str frame-id))
                                :clips (clip-frames original objects modifiers)
                                :width (:width shape) :height (:height shape)
                                :x (:x shape) :y (:y shape) :points (:points shape)
                                :html (get (embed-data shape) "html")
                                :state (get (embed-data shape) "state" "{}")}))))
        create (fn [source target-id]
                 (when-not read-only
                   (let [frames (filter #(and (= :frame (:type %)) (not= (:id %) uuid/zero)) (vals objects))
                         current (dsh/lookup-page-objects @st/state page-id)
                         current-selected (dsh/lookup-selected @st/state)
                         chosen (get current (if target-id (uuid/uuid target-id) (first current-selected)))
                         frame (or (when (= :frame (:type chosen)) chosen)
                                   (when (= 1 (count frames)) (first frames)))
                         center (if frame (gpt/point (+ (:x frame) (/ (:width frame) 2))
                                                     (+ (:y frame) (/ (:height frame) 2)))
                                    (dsh/get-viewport-center @st/state))
                         attrs (cond-> {:name "HTML · 交互块" :width 640 :height 420
                                        :fills [{:fill-color "#16181d" :fill-opacity 1}]
                                        :plugin-data {data-namespace {"html" source "state" "{}"}}}
                                 frame (assoc :x (:x frame) :y (:y frame)
                                              :width (:width frame) :height (:height frame)
                                              :constraints-h :leftright :constraints-v :topbottom))]
                     (st/emit! (shapes/add-shape
                                (cts/setup-shape
                                 (assoc attrs :type :rect
                                        :x (if frame (:x frame) (- (:x center) 320))
                                        :y (if frame (:y frame) (- (:y center) 210))
                                        :frame-id (if frame (:id frame) uuid/zero)
                                        :parent-id (if frame (:id frame) uuid/zero)))
                                {:skip-edition? true})))))
        fit (fn [raw-id]
              (when (and (not read-only) (= file-id (:current-file-id @st/state))
                         (= page-id (:current-page-id @st/state)))
                (let [id (uuid/uuid raw-id)
                      current (dsh/lookup-page-objects @st/state page-id)
                      shape (get current id) frame (get current (:frame-id shape))]
                  (when (and frame (not= (:id frame) uuid/zero))
                    (st/emit! (shapes/update-shapes [id] #(fitted-shape % frame) {:page-id page-id}))))))
        save (fn [id key value]
               (when (and (not read-only) (contains? #{"html" "state"} key))
                 (let [id (uuid/uuid id)]
                   (when (get objects id)
                     (if (and (= file-id (:current-file-id @st/state))
                              (= page-id (:current-page-id @st/state)))
                       (st/emit! (shapes/update-shapes
                                  [id] #(assoc-in % [:plugin-data data-namespace key] value)
                                  {:attrs #{:plugin-data} :page-id page-id}))
                       (st/emit! (dp/set-plugin-data file-id :shape id page-id
                                                     data-namespace key value)))))))]
    (mf/with-effect [entries selected vbox zoom read-only viewer palette-size]
      (when-let [node (mf/ref-val node-ref)]
        (.call (aget node "setContext") node
               #js {:shapes (clj->js entries) :selected (clj->js (mapv str selected))
                    :vbox (clj->js vbox) :zoom zoom :paletteSize (or palette-size 0)
                    :fileId (str file-id) :pageId (str page-id)
                    :readOnly (boolean read-only) :viewer (boolean viewer)
                    :create create :fit fit :save save
                    :select (fn [id] (st/emit! (selection/select-shape (uuid/uuid id))))})))
    [:xenica-html-embed-layer {:ref node-ref}]))

(mf/defc viewer-layer*
  [{:keys [page frame size delta]}]
  (let [objects (vpc/prepare-objects frame size (or delta (gpt/point 0 0)) (:objects page))
        ids (cons (:id frame) (cfh/get-children-ids objects (:id frame)))]
    [:> layer* {:objects (select-keys objects ids)
                :selected #{} :vbox {:x 0 :y 0} :zoom (vpc/viewer-scale size)
                :file-id nil :page-id (:id page) :read-only true :viewer true}]))
