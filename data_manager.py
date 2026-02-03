
import json
from collections import defaultdict

DATA_FILE = 'prices_data.json'

def get_data():
    """从 JSON 文件读取价格数据。"""
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        # 如果文件不存在或为空，返回一个默认结构
        return {
            "categories": {},
            "components": {},
            "discounts": []
        }

def save_data(data):
    """将价格数据写入 JSON 文件。"""
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def update_data_from_form(form_data):
    """根据管理员提交的表单更新数据。"""
    data = get_data()
    
    # --- 更新组件 ---
    new_components = defaultdict(list)
    # 收集表单数据
    # form_data might look like: {'component-cpu-0-name': 'Intel i5', 'component-cpu-0-price': '1800', ...}
    
    # 找到所有组件的索引
    component_indices = defaultdict(set)
    for key in form_data:
        if key.startswith('component-'):
            parts = key.split('-')
            category = parts[1]
            index = parts[2]
            component_indices[category].add(index)

    # 重新构建组件列表
    for category, indices in component_indices.items():
        # 添加默认“请选择”项
        new_components[category].append({"id": f"{category}_0", "name": "-- 请选择 --", "price": 0})
        
        for index in sorted(indices, key=int):
            name_key = f'component-{category}-{index}-name'
            price_key = f'component-{category}-{index}-price'
            
            name = form_data.get(name_key, '').strip()
            price_str = form_data.get(price_key, '0').strip()
            
            if name: # 只有当名称不为空时才添加
                try:
                    price = float(price_str)
                    # id 需要重新生成以保持连续性
                    new_id_index = len(new_components[category])
                    new_components[category].append({
                        "id": f"{category}_{new_id_index}",
                        "name": name,
                        "price": price
                    })
                except ValueError:
                    # 如果价格无效，可以跳过或记录错误
                    print(f"Invalid price for {name}: {price_str}")
                    continue
    
    data['components'] = new_components
    
    # --- 更新折扣 ---
    new_discounts = []
    discount_indices = sorted(list(set(k.split('-')[2] for k in form_data if k.startswith('discount-'))), key=int)
    
    for index in discount_indices:
        name = form_data.get(f'discount-{index}-name', '').strip()
        multiplier_str = form_data.get(f'discount-{index}-multiplier', '1.0').strip()
        if name:
            try:
                multiplier = float(multiplier_str)
                new_discounts.append({
                    "id": name.lower().replace(' ', '_'),
                    "name": name,
                    "multiplier": multiplier
                })
            except ValueError:
                print(f"Invalid multiplier for {name}: {multiplier_str}")
                continue
    
    data['discounts'] = new_discounts

    save_data(data)
