# 技术笔记校订记录

校订日期：2026-10-09。

本次针对八篇已迁入的 CSDN 技术笔记检查了明确的 API 说明、代码与文字的一致性、C++ 编译语法，以及少量可独立验证的示例。六篇作了下列局部校订。原有标题、作者、发布时间、原文更新时间、source_id、source_url、permalink 和实验输出均保留；每篇正文末尾有独立的当前校订记录。以后重新导入原文时，应保留这些校订，而不要将当前校订日期冒充原文日期。

## 已校订内容

- `149880710`，PyTorch 基本操作实验：将与实际代码不符的 TensorFlow 和 tf.stop_gradient 说明改为 PyTorch 广播、非原地减法及 torch.no_grad；解释原地减法不能扩张目标形状。33 个 Python 代码块未改动，训练记录未重跑或替换。[PyTorch 广播文档](https://docs.pytorch.org/docs/stable/notes/broadcasting.html)和 [no_grad 文档](https://docs.pytorch.org/docs/stable/generated/torch.no_grad.html)。
- `124387071`，vector：更正不存在的 emplace_front，给出 emplace(begin(), ...) 的用法；说明扩容倍数未由标准规定、reserve 保证容量至少达到请求值且不改变 size，并去掉 emplace 必然更快的保证。六个代码块未改动。[vector 接口](https://eel.is/c++draft/vector.overview)、[容量规则](https://eel.is/c++draft/vector.capacity)、[插入规则](https://eel.is/c++draft/vector.modifiers)。
- `124460411`，set：更正 set_union 的并集说明和 std::cout 名称；补充比较器决定排序及等价关系、查找失败时 end() 不能解引用、集合算法的排序和输出区间要求。声明块明确标为非独立程序的示意；仅移除了删除示例中阻止编译的一个 U+200B 字符。[关联容器要求](https://eel.is/c++draft/associative.reqmts)、[set_union](https://eel.is/c++draft/set.union)、[输出流迭代器](https://eel.is/c++draft/ostream.iterator)。
- `124338541`，全排列：将 n=3 的 a 数组下标解释从 1 至 3 校正为 0 至 2，与 dfs(0)、a[step] 和输出循环一致。代码未改动。
- `124338392`，2022 蓝桥杯：“李白打酒加强版”遇花状态转移增加 k+1<N 判断。原代码在 k=109 时读取长度为 110 的数组的第 110 号下标，原样例即可触发 UBSan；更正后样例仍为 14。[数组下标](https://eel.is/c++draft/expr.sub)、[指针运算范围](https://eel.is/c++draft/expr.add)。
- `131792879`，2023 蓝桥杯：“日期统计”中将 printf("%d", st.size()) 换成 cout 输出，消除容器无符号大小类型与 %d 的格式不匹配。其他代码和原文记录的答案保留。[容器类型要求](https://eel.is/c++draft/container.reqmts)、[整数输出重载](https://eel.is/c++draft/ostream.inserters.arithmetic)。

`124514677`（列车调度）和 `154834561`（分治）未改动。

## 可重复的验证

运行：

```sh
node --test tests/technical-notes.test.cjs
```

本次环境中 12 项测试全部通过，无跳过：

- 八篇文章的来源标识、永久链接及原始日期回归检查。
- 六篇校订记录与指定说明的文本回归检查。
- 46 个非示意 C++ 代码块通过 g++ 的 C++11 语法检查。set 声明示意块明确排除；LeetCode 的 Solution 类仅补充平台通常提供的 vector 头文件和 std 命名空间用于语法检查。
- 33 个 PyTorch Python 代码块通过 ast.parse 语法检查；没有导入 torch 或运行训练。
- set 集合运算样例输出并集、交集、差集、对称差集与预期一致；移除不可见字符后的 erase 示例通过编译并输出 1 2 3。
- DFS 在 n=3 时按顺序输出六个排列。
- 李白打酒代码在 `-fsanitize=undefined -fno-sanitize-recover=all` 下通过原文 `5 10 → 14` 样例，以及 32 个小规模用例；小用例与独立递归计数比较一致。
- 日期统计代码在 `-Werror=format` 下通过编译，并在 100 个零的输入上输出 0。这只用于类型和基本运行检查。

本次不是整套题的重新评测，也没有完整证明全部算法、边界、时间或空间复杂度。语法检查不等于运行正确性。当前环境没有安装 PyTorch，因此没有重新执行张量运算或训练实验。需要 g++ 或 Python 的测试在对应解释器/编译器不可用时会明确跳过。
