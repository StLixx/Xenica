;; This Source Code Form is subject to the terms of the Mozilla Public
;; License, v. 2.0. https://mozilla.org/MPL/2.0/
(ns app.main.ui.workspace.html-embed
  (:require
   [app.common.files.helpers :as cfh]
   [app.common.geom.point :as gpt]
   [app.common.geom.shapes :as gsh]
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

(mf/defc layer*
  [{:keys [objects selected vbox zoom file-id page-id modifiers read-only viewer]}]
  (let [node-ref (mf/use-ref nil)
        entries (->> (vals objects)
                     (filter #(and (not (:hidden %)) (get (embed-data %) "html")))
                     (mapv (fn [shape]
                             (let [shape (if-let [m (get modifiers (:id shape))]
                                           (if-let [geometry (:modifiers m)]
                                             (gsh/transform-shape shape geometry)
                                             (gsh/apply-transform shape m))
                                           shape)]
                               {:id (str (:id shape))
                                :width (:width shape)
                                :height (:height shape)
                                :x (:x shape)
                                :y (:y shape)
                                :points (:points shape)
                                :html (get (embed-data shape) "html")
                                :state (get (embed-data shape) "state" "{}")}))))
        create (fn [source]
                 (when-not read-only
                   (let [center (dsh/get-viewport-center @st/state)]
                     (st/emit!
                      (shapes/create-and-add-shape
                       :rect (:x center) (:y center)
                       {:name "HTML · 交互块" :width 640 :height 420
                        :fills [{:fill-color "#16181d" :fill-opacity 1}]
                        :plugin-data {data-namespace {"html" source "state" "{}"}}})))))
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
    (mf/with-effect [entries selected vbox zoom read-only viewer]
      (when-let [node (mf/ref-val node-ref)]
        (.call (aget node "setContext") node
               #js {:shapes (clj->js entries)
                    :selected (clj->js (mapv str selected))
                    :vbox (clj->js vbox) :zoom zoom
                    :fileId (str file-id) :pageId (str page-id)
                    :readOnly (boolean read-only) :viewer (boolean viewer)
                    :create create :save save
                    :select (fn [id] (st/emit! (selection/select-shape (uuid/uuid id))))})))
    [:xenica-html-embed-layer {:ref node-ref}]))

(mf/defc viewer-layer*
  [{:keys [page frame size delta]}]
  (let [objects (vpc/prepare-objects frame size (or delta (gpt/point 0 0)) (:objects page))
        ids (cons (:id frame) (cfh/get-children-ids objects (:id frame)))]
    [:> layer* {:objects (select-keys objects ids)
                :selected #{} :vbox {:x 0 :y 0} :zoom (vpc/viewer-scale size)
                :file-id nil :page-id (:id page) :read-only true :viewer true}]))
