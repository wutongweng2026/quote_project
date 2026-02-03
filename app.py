
import os
import json
import google.generativeai as genai
from flask import Flask, render_template, request, jsonify
import data_manager

# --- 初始化 ---
app = Flask(__name__, template_folder='templates')

# --- Gemini API 配置 ---
api_key = os.getenv('API_KEY')
if not api_key:
    raise ValueError("API_KEY not found in environment variables.")
genai.configure(api_key=api_key)
model = genai.GenerativeModel('gemini-1.5-flash-latest')


# --- 路由定义 ---

@app.route('/')
def index():
    """渲染主报价页面，并传入最新的价格数据。"""
    pricing_data = data_manager.get_data()
    return render_template('index.html', data=pricing_data)

@app.route('/admin')
def admin():
    """渲染管理员页面，用于编辑价格数据。"""
    pricing_data = data_manager.get_data()
    return render_template('admin.html', data=pricing_data)

@app.route('/update-prices', methods=['POST'])
def update_prices():
    """处理来自管理员页面的表单提交，更新价格数据。"""
    form_data = request.form.to_dict()
    data_manager.update_data_from_form(form_data)
    pricing_data = data_manager.get_data()
    return render_template('admin.html', success_message="价格已成功更新！", data=pricing_data)

@app.route('/calculate', methods=['POST'])
def calculate():
    """根据用户选择计算估算总价。"""
    try:
        req_data = request.json
        selections = req_data.get('selections', [])
        discount_id = req_data.get('discountId')
        special_reduction = float(req_data.get('specialReduction', 0))
        
        pricing_data = data_manager.get_data()
        
        # 计算组件总价
        base_total = 0
        for sel in selections:
            category, item_id, quantity = sel['category'], sel['itemId'], sel['quantity']
            if item_id and item_id != f"{category}_0":
                item = next((c for c in pricing_data['components'][category] if c['id'] == item_id), None)
                if item:
                    base_total += item['price'] * quantity
        
        # 应用折扣
        discount = next((d for d in pricing_data['discounts'] if d['id'] == discount_id), None)
        discount_multiplier = discount['multiplier'] if discount else 1.0
        
        total_after_discount = base_total * discount_multiplier
        
        # 应用特别立减
        final_total = total_after_discount - special_reduction
        
        return jsonify({'total': final_total})

    except Exception as e:
        print(f"Calculation Error: {e}")
        return jsonify({'error': '计算价格时发生错误'}), 500

@app.route('/match-config', methods=['POST'])
def match_config():
    """使用 Gemini API 解析配置字符串并匹配现有组件。"""
    try:
        req_data = request.json
        config_string = req_data.get('configString')
        pricing_data = data_manager.get_data()

        prompt = f"""
            任务：你是一个专业的电脑硬件配置分析师。请分析以下用户提供的配置字符串，并从下面提供的“可用组件列表”中，为每个硬件类别（如 cpu, ram, gpu 等）选择最匹配的一个组件。

            规则：
            1.  严格从“可用组件列表”中选择组件的 `id`。
            2.  如果某个类别在用户字符串中没有明确提及或无法匹配，请忽略该类别。
            3.  输出必须是纯粹的 JSON 格式，键是组件类别（例如 "cpu", "ram"），值是所选组件的 `id`。

            可用组件列表 (JSON格式):
            {json.dumps(pricing_data['components'])}

            用户配置字符串:
            "{config_string}"

            请输出匹配结果的 JSON 对象。
        """
        response = model.generate_content(prompt)
        # 清理 Gemini 可能返回的 markdown 代码块
        cleaned_response = response.text.strip().replace('```json', '').replace('```', '').strip()
        matched_ids = json.loads(cleaned_response)
        
        return jsonify(matched_ids)

    except Exception as e:
        print(f"Match Config Error: {e}")
        return jsonify({'error': '无法解析配置'}), 500


@app.route('/generate-quote', methods=['POST'])
def generate_quote():
    """调用 Gemini API 生成硬件报价单。"""
    try:
        req_data = request.json
        final_config_text = req_data.get('finalConfigText')
        total_price = req_data.get('totalPrice')

        prompt = f"""
            请你扮演一位专业的电脑硬件销售顾问。根据以下客户已选定的电脑配置和总价，生成一份简洁、专业、友好的报价单。

            报价单需要使用 Markdown 格式，并包含以下部分：
            1.  一个专业的标题，例如“电脑组装配置报价单”。
            2.  一个名为“配置详情”的章节，直接使用下面提供的客户最终配置信息。
            3.  一个名为“费用总览”的章节，清晰地标明最终的合计金额。
            4.  一些友好的提示，例如关于品质保证、售后服务或交货时间等。
            5.  一个感谢客户并鼓励他们进行下一步确认的结尾。

            客户最终配置:
            ---
            {final_config_text}
            ---

            最终合计金额: ¥{total_price:,.2f} 元

            请确保最终输出的语言为简体中文，格式专业、易于阅读。
        """
        
        response = model.generate_content(prompt)
        
        return jsonify({'quote': response.text})

    except Exception as e:
        print(f"Gemini API Error: {e}")
        return jsonify({'error': '无法生成报价。请检查您的网络连接或 API 配置。'}), 500

# --- 运行应用 ---
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
