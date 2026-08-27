# Emergent 与 Intentional 的平衡

宏观的架构方向是 intentional 的——模块边界、核心数据模型、组件之间的接口契约，这些需要预先想清楚。微观的模块内部细节让它 emergent 地生长——在写代码的过程中自然浮现。

两条腿走路：纯 emergent 在复杂系统中会变成一盘散沙，纯 intentional 会变成僵硬的蓝图。把 intentional 留给"错了代价大"的决定，把 emergent 留给"改起来便宜"的细节。

## 具体场景

模块怎么拆、API 风格是什么、数据模型的核心约束——这些提前定，写成 ADR。模块内部的函数组织、具体实现模式、细粒度优化——边写边冒出来，不提前设计。

> *来源：SAFe——"blends intentional architecture with emergent design"；Simon Brown《Software Architecture for Developers》——"just enough up-front design"*
