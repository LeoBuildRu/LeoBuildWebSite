from django.shortcuts import render
from django.http import JsonResponse
from .models import *
from django.views.decorators.csrf import csrf_exempt

# Create your views here.

cart_total = 0

def index_page(request):
    return render(request, 'index.html')

def builder_page(request):
    return render(request, 'builder.html')

def get_products(request):
    products = Product_Item.objects.all().values('unique_id', 'product_name', 'product_icon', 'product_url', 'product_price', 'product_material', 'product_height', 'product_width', 'product_depth', 'product_short_description', 'product_description', 'product_categories', 'product_company', 'created_date')
    
    post_products = []
    for product in products:
        product_item = Product_Item.objects.get(unique_id=product['unique_id'])
        images = [img.image.url for img in product_item.images.all()]  # Получаем URL изображений
        product['product_images'] = images
        post_products.append(product)
        
    # print(post_products)
    # for product in post_products:
    #     print(f"Продукт: {product['product_name']}")
    #     for image in product['product_images']:
    #         print(f"{image}")

    return JsonResponse(list(post_products), safe=False)

def add_to_cart(request):
    if request.method == 'POST':
        item_id = request.POST.get('item_id')
        # Здесь вы можете использовать сессию или другую логику для хранения корзины
        cart = request.session.get('cart', {})
        # Увеличиваем количество товара в корзине или добавляем новый
        if item_id in cart:
            cart[item_id]['quantity'] += 1
        else:
            item = Product_Item.objects.get(unique_id=item_id)
            cart[item_id] = {
                'title': item.product_name,
                'icon': item.product_icon.url,
                'price': str(item.product_price),
                'quantity': 1
            }
        request.session['cart'] = cart

        total_amount = 0  # Переменная для хранения общей суммы
        # Проходим по каждому элементу в корзине и вычисляем сумму
        for item_id, item_data in cart.items():
            item_price = float(item_data['price'])  # Преобразуем цену в float
            item_quantity = item_data['quantity']
            item_total = item_price * item_quantity  # Считаем итоговую сумму для данного товара
            item_data['total'] = item_total  # Добавляем итоговую сумму в данные элемента
            total_amount += item_total  # Добавляем к общей сумме

        context = {
            'cart': cart,
            'total_amount': total_amount,  # Добавляем общую сумму в контекст
        }

        return JsonResponse({'success': True, 'cart': cart})
    
def cart_view(request):
    cart = request.session.get('cart', {})
    total_amount = 0  # Переменная для хранения общей суммы

    # Проходим по каждому элементу в корзине и вычисляем сумму
    for item_id, item_data in cart.items():
        item_price = float(item_data['price'])  # Преобразуем цену в float
        item_quantity = item_data['quantity']
        item_total = item_price * item_quantity  # Считаем итоговую сумму для данного товара
        item_data['total'] = item_total  # Добавляем итоговую сумму в данные элемента
        total_amount += item_total  # Добавляем к общей сумме

    context = {
        'cart': cart,
        'total_amount': total_amount,  # Добавляем общую сумму в контекст
    }
    return render(request, 'cart.html', context)

def get_item_info(request):
    item_id = request.GET.get('item_id')
    item = Product_Item.objects.get(unique_id=item_id)
    product_images = [img.image.url for img in item.images.all()]  # Получаем URL изображений

    context = {
        'title': item.product_name,
        'images': product_images,
        'info': item.product_description,
        'price': str(item.product_price),
        'material': str(item.product_material),
        'height': str(item.product_height),
        'width': str(item.product_width),
        'depth': str(item.product_depth),
    }
    return JsonResponse(context)  # или любой другой атрибут

def get_cart_info(request):
    cart = request.session.get('cart', {})
    total_amount = 0  # Переменная для хранения общей суммы
    print(cart)

    # Проходим по каждому элементу в корзине и вычисляем сумму
    for item_id, item_data in cart.items():
        item_price = float(item_data['price'])  # Преобразуем цену в float
        item_quantity = item_data['quantity']
        item_total = item_price * item_quantity  # Считаем итоговую сумму для данного товара
        item_data['total'] = item_total  # Добавляем итоговую сумму в данные элемента
        total_amount += item_total  # Добавляем к общей сумме


    context = {
        'cart': cart,
        'total_amount': total_amount,  # Добавляем общую сумму в контекст
    }
    return JsonResponse(context)  # или любой другой атрибут